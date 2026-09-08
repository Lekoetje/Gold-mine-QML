// ============================================================================
// ORCHESTRATOR (Section 40)
// Wires every engine together and runs the same candle-by-candle sequence
// for both historical replay and live processing, so backtests and live
// signals share identical logic (no look-ahead, Section 39).
// ============================================================================

import { CONFIG } from './config.js';
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

    this.qmCandidates = [];
    this.rsiSeries = [];
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
  runFull(htfTrends = { D1: 'NEUTRAL', H4: 'NEUTRAL', H1: 'NEUTRAL' }) {
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

      // 12: (S/D + FVG confluence stub — Sections 20-21) left at neutral until a
      // dedicated zone-detection pass is added; documented in README as a
      // known limitation rather than silently fabricated.
      const confluence = 0.3;

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
        reasons: this._reasonList({ qm, sweep, htf, reaction, divergence }),
        nowMs
      };
      this.signalEngine.upsertDeveloping(qm, snapshot);

      // 19: lock if confirmed (mandatory conditions + score threshold; see signalStateEngine)
      if (!this.newsEngine.shouldBlockConfirmation(nowMs)) {
        const locked = this.signalEngine.tryConfirmAndLock(qm, { ...snapshot, reacted: reaction.reacted }, this.config);
        if (locked?.state === 'LOCKED') {
          this.storageEngine.save(locked); // 21: store event
        }
      }
    }

    this.qmCandidates = qmCandidates;

    return {
      candles, atrSeries, swings: labeled, trend, sweeps, qmCandidates,
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

  _reasonList({ qm, sweep, htf, reaction, divergence }) {
    const reasons = ['QM'];
    if (sweep) reasons.push('Liquidity Sweep');
    reasons.push('BOS');
    if (qm.ftbDone) reasons.push('FTB');
    if (htf.score >= 0.66) reasons.push('HTF Alignment');
    if (reaction.reacted) reasons.push(`Reaction (${reaction.kind})`);
    if (divergence !== 'none') reasons.push(`Divergence (${divergence})`);
    return reasons;
  }

  _emptyResult() {
    return {
      candles: [], atrSeries: [], swings: [], trend: 'UNKNOWN', sweeps: [], qmCandidates: [],
      signals: [], activeSignals: [], volatilityClass: 'UNKNOWN', session: ['off_hours'],
      newsRisk: { level: 'LOW', event: null }, nextNewsEvent: null
    };
  }
}
