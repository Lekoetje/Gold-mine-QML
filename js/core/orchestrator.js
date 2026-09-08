// ============================================================================
// ORCHESTRATOR (Section 40)
// Wires every engine together and runs the same candle-by-candle sequence
// for both historical replay and live processing, so backtests and live
// signals share identical logic (no look-ahead, Section 39).
// ============================================================================

import { CONFIG } from './config.js';
import { resampleCandles } from './resample.js';
import { CandleEngine } from '../engines/candleEngine.js';
import { SwingEngine } from '../engines/swingEngine.js';
import { MarketStructureEngine } from '../engines/marketStructureEngine.js';
import { VolatilityEngine } from '../engines/volatilityEngine.js';
import { LiquidityEngine } from '../engines/liquidityEngine.js';
import { QMQMLEngine } from '../engines/qmqmlEngine.js';
import { ConfirmationEngine } from '../engines/confirmationEngine.js';
import { SessionEngine } from '../engines/sessionEngine.js';
import { NewsEngine } from '../engines/newsEngine.js';
import { ScoringEngine } from '../engines/scoringEngine.js';
import { RiskEngine } from '../engines/riskEngine.js';
import { SignalStateEngine } from '../engines/signalStateEngine.js';
import { StorageEngine } from '../engines/storageEngine.js';
import { SupplyDemandEngine } from '../engines/supplyDemandEngine.js';
import { FVGEngine } from '../engines/fvgEngine.js';
import { FibonacciEngine } from '../engines/fibonacciEngine.js';
import { TradeManagementEngine } from '../engines/tradeManagementEngine.js';

export class Orchestrator {
  constructor(config = CONFIG) {
    this.config = config;
    this.candleEngine = new CandleEngine(config.timeframes.primary);
    this.swingEngine = new SwingEngine(config);
    this.structureEngine = new MarketStructureEngine();
    this.volatilityEngine = new VolatilityEngine(config);
    this.liquidityEngine = new LiquidityEngine(config);
    this.qmEngine = new QMQMLEngine(config);
    this.confirmationEngine = new ConfirmationEngine(config);
    this.sessionEngine = new SessionEngine(config);
    this.newsEngine = new NewsEngine(config);
    this.scoringEngine = new ScoringEngine(config);
    this.riskEngine = new RiskEngine(config);
    this.signalEngine = new SignalStateEngine();
    this.storageEngine = new StorageEngine(config);
    this.supplyDemandEngine = new SupplyDemandEngine(config);
    this.fvgEngine = new FVGEngine();
    this.fibonacciEngine = new FibonacciEngine(config);
    this.tradeManagementEngine = new TradeManagementEngine();

    // Separate structure engines for each HTF, reused across runs so trend
    // derivation stays cheap and consistent with the primary-TF logic.
    this.htfStructureEngines = { D1: new MarketStructureEngine(), H4: new MarketStructureEngine(), H1: new MarketStructureEngine() };
    this.htfSwingEngines = { D1: new SwingEngine(config), H4: new SwingEngine(config), H1: new SwingEngine(config) };
    this.htfVolatilityEngines = { D1: new VolatilityEngine(config), H4: new VolatilityEngine(config), H1: new VolatilityEngine(config) };

    this.qmCandidates = [];
    this.rsiSeries = [];
  }

  /**
   * Derives real D1/H4/H1 trend states from the primary-timeframe candle
   * series via resampling (Section 19) — replaces manually-fed HTF inputs.
   * Falls back to 'NEUTRAL' for a timeframe if there isn't enough resampled
   * history yet (e.g. early in a short demo run).
   */
  computeHTFTrends(primaryCandles) {
    const trends = {};
    for (const tf of ['D1', 'H4', 'H1']) {
      const resampled = resampleCandles(primaryCandles, tf);
      if (resampled.length < 20) { trends[tf] = 'NEUTRAL'; continue; }
      const atr = this.htfVolatilityEngines[tf].update(resampled);
      const swings = this.htfSwingEngines[tf].update(resampled, atr);
      const { trend } = this.htfStructureEngines[tf].update(swings);
      trends[tf] = trend === 'BULLISH' || trend === 'BEARISH' ? trend : 'NEUTRAL';
    }
    return trends;
  }

  loadHistoricalCandles(candles) {
    this.candleEngine.loadHistory(candles);
  }

  loadNews(events) {
    this.newsEngine.loadEvents(events);
  }

  /**
   * Full re-run of the analysis pipeline over all currently-loaded closed
   * candles. This mirrors the 21-step list in Section 40; steps 1–17 are
   * pattern/context detection, 18–21 are signal lifecycle management.
   */
  runFull(htfTrendsOverride = null) {
    const candles = this.candleEngine.getClosedCandles();
    if (candles.length < 20) return this._emptyResult();

    // 1-2: structure + swings
    const atrSeries = this.volatilityEngine.update(candles);
    const swings = this.swingEngine.update(candles, atrSeries);
    const { swings: labeled, trend } = this.structureEngine.update(swings);

    // 3: liquidity
    const sweeps = this.liquidityEngine.detectSweeps(candles, labeled, atrSeries);

    // 4-5: QM / QML detection
    const qmCandidates = this.qmEngine.detect(candles, labeled, this.structureEngine, atrSeries);

    // Real HTF trends derived from the same primary candles via resampling,
    // unless the caller explicitly overrides them (e.g. tests).
    const htfTrends = htfTrendsOverride || this.computeHTFTrends(candles);

    // Supply/Demand + FVG zones, computed once per run
    const sdZones = this.supplyDemandEngine.detect(candles, atrSeries);
    const fvgZones = this.fvgEngine.detect(candles);

    // 13: RSI for optional divergence
    this.rsiSeries = this.confirmationEngine.computeRSI(candles, this.config.divergence.rsiPeriod);

    const lastIndex = candles.length - 1;
    const nowMs = candles[lastIndex].bucketStart;

    for (const qm of qmCandidates) {
      // 6-8: zone state (BOS already found at detection time), FTB tracking, expiration
      for (let i = qm.bos.index; i <= lastIndex; i++) {
        this.qmEngine.updateZoneState(qm, candles, i);
        if (['INVALIDATED', 'STALE'].includes(qm.state)) break;
      }
      if (['INVALIDATED', 'STALE'].includes(qm.state)) {
        this.signalEngine.invalidate(qm);
        continue;
      }

      // 9: reaction check
      const reaction = this.confirmationEngine.checkQMLReaction(qm, candles, atrSeries);

      // 10: HTF
      const htf = this.confirmationEngine.htfAlignment(qm, htfTrends);

      // 11: divergence
      const divergence = this.confirmationEngine.checkDivergence(qm, candles, this.rsiSeries);

      // 12: real S/D + FVG + Fibonacci confluence (Sections 20-22)
      const atrAtHead = atrSeries[qm.head.index] || atrSeries[atrSeries.length - 1] || 0;
      const sdHit = this.supplyDemandEngine.overlapsQML(sdZones, qm);
      const fvgHit = this.fvgEngine.overlapsQML(fvgZones, qm);
      const fibHit = this.fibonacciEngine.checkConfluence(qm, atrAtHead);
      let confluence = 0;
      if (sdHit) confluence += 0.45;
      if (fvgHit) confluence += 0.35;
      if (fibHit === 'goldenRatio') confluence += 0.2;
      else if (fibHit === 'fifty') confluence += 0.1;
      confluence = Math.min(1, confluence);

      // 14: volatility class
      const volatilityClass = this.volatilityEngine.classify(lastIndex);

      // 15: session bonus
      const sessionBonus = this.sessionEngine.contextBonus(nowMs);

      // 16: score
      const sweep = this._bestSweepNear(sweeps, qm);
      const qmlQuality = 0.5 + this.qmEngine.freshnessScore(qm) / 20; // fold freshness into 0..1-ish
      const newsRisk = this.newsEngine.riskAt(nowMs).level;

      const scoreResult = this.scoringEngine.score({
        qmValid: qm.state !== 'INVALIDATED',
        qmlQuality: Math.max(0, Math.min(1, qmlQuality)),
        sweepGrade: sweep?.grade ?? null,
        bosQuality: 0.8,
        ftbDone: qm.ftbDone,
        htfAlignment: htf.score,
        divergence,
        confluence,
        volatilityClass,
        sessionBonus,
        newsRisk
      });

      // 17: risk (SL/TP1/RR) computed against the current close as a provisional entry
      const entryPrice = candles[lastIndex].close;
      const atr = this.volatilityEngine.getCurrentATR() || 1;
      const structuralTargets = labeled.map(s => s.price);
      const trade = this.riskEngine.computeTrade(qm, entryPrice, atr, structuralTargets);

      // 18: create/update DEVELOPING/ARMED signal record
      const snapshot = {
        score: scoreResult.total,
        breakdown: scoreResult.breakdown,
        entry: trade.entry,
        sl: trade.sl,
        tp1: trade.tp1,
        rr: trade.rr,
        timeframe: this.config.timeframes.primary,
        reasons: this._reasonList({ qm, sweep, htf, reaction, divergence, sdHit, fvgHit, fibHit }),
        session: this.sessionEngine.classify(nowMs).join('+'),
        volatilityAtEntry: volatilityClass,
        nowMs
      };
      this.signalEngine.upsertDeveloping(qm, snapshot);

      // 19: lock if confirmed (mandatory conditions + score threshold; see signalStateEngine)
      if (!this.newsEngine.shouldBlockConfirmation(nowMs)) {
        const locked = this.signalEngine.tryConfirmAndLock(qm, { ...snapshot, reacted: reaction.reacted, lockIndex: lastIndex }, this.config);
        if (locked?.state === 'LOCKED') {
          this.storageEngine.save(locked); // 21: store event
        }
      }
    }

    this.qmCandidates = qmCandidates;

    // 20: trade management — walk every open (LOCKED or later) signal forward
    // through whatever candles exist past its lock point, checking for a
    // stop-out, TP1 hit, and structural trailing (Section 17). Deterministic
    // and idempotent — safe to re-run every time runFull() is called.
    for (const signal of this.signalEngine.getActive()) {
      if (!['LOCKED', 'TP1_HIT', 'RUNNER', 'TRAILING'].includes(signal.state)) continue;
      const managed = this.tradeManagementEngine.manage(signal, candles, labeled, this.signalEngine);
      if (managed && managed.state === 'CLOSED') this.storageEngine.save(managed);
    }

    return {
      candles, atrSeries, swings: labeled, trend, sweeps, qmCandidates,
      sdZones, fvgZones, htfTrends,
      signals: this.signalEngine.getAll(),
      activeSignals: this.signalEngine.getActive(),
      volatilityClass: this.volatilityEngine.classify(lastIndex),
      session: this.sessionEngine.classify(nowMs),
      newsRisk: this.newsEngine.riskAt(nowMs),
      nextNewsEvent: this.newsEngine.nextEvent(nowMs)
    };
  }

  _bestSweepNear(sweeps, qm) {
    const near = sweeps.filter(s => Math.abs(s.index - qm.head.index) <= 5 && s.type === qm.direction);
    if (near.length === 0) return null;
    const order = { Strong: 3, Moderate: 2, Weak: 1 };
    return near.sort((a, b) => order[b.grade] - order[a.grade])[0];
  }

  _reasonList({ qm, sweep, htf, reaction, divergence, sdHit, fvgHit, fibHit }) {
    const reasons = ['QM'];
    if (sweep) reasons.push('Liquidity Sweep');
    reasons.push('BOS');
    if (qm.ftbDone) reasons.push('FTB');
    if (htf.score >= 0.66) reasons.push('HTF Alignment');
    else if (htf.conflictDetected) reasons.push('HTF Conflict');
    if (reaction.reacted) reasons.push(`Reaction (${reaction.kind})`);
    if (divergence !== 'none') reasons.push(`Divergence (${divergence})`);
    if (sdHit) reasons.push('Supply/Demand');
    if (fvgHit) reasons.push('FVG');
    if (fibHit !== 'none') reasons.push(`Fibonacci (${fibHit})`);
    return reasons;
  }

  _emptyResult() {
    return {
      candles: [], atrSeries: [], swings: [], trend: 'UNKNOWN', sweeps: [], qmCandidates: [],
      sdZones: [], fvgZones: [], htfTrends: { D1: 'NEUTRAL', H4: 'NEUTRAL', H1: 'NEUTRAL' },
      signals: [], activeSignals: [], volatilityClass: 'UNKNOWN', session: ['off_hours'],
      newsRisk: { level: 'LOW', event: null }, nextNewsEvent: null
    };
  }
}
