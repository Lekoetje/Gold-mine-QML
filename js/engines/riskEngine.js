// ============================================================================
// RISK ENGINE (Sections 15–17, 50–51)
// Adaptive SL (ATR-based, never a fixed pip distance), structural TP1,
// automatic R:R, and position sizing against account risk %.
// ============================================================================

export class RiskEngine {
  constructor(config) {
    this.config = config.riskModel;
  }

  /**
   * @param qm the QM candidate (with head, qmlZone, direction)
   * @param candles closed candle series
   * @param atr current ATR value
   * @param structuralTargets array of candidate swing prices to use as TP1
   */
  computeTrade(qm, entryPrice, atr, structuralTargets) {
    const buffer = atr * this.config.slBufferATRMult;
    const sl = qm.direction === 'bearish'
      ? qm.head.price + buffer
      : qm.head.price - buffer;

    const tp1 = this._nearestStructuralTarget(qm, entryPrice, structuralTargets);

    const risk = Math.abs(entryPrice - sl);
    const reward = Math.abs(tp1 - entryPrice);
    const rr = risk > 0 ? reward / risk : 0;

    return {
      entry: entryPrice,
      sl,
      tp1,
      rr: Math.round(rr * 100) / 100,
      meetsMinRR: rr >= this.config.minRR,
      isPreferredRR: rr >= this.config.preferredRR
    };
  }

  _nearestStructuralTarget(qm, entryPrice, structuralTargets) {
    if (!structuralTargets || structuralTargets.length === 0) {
      // fallback: mirror the risk distance for a 1:1 minimum target
      const buffer = Math.abs(entryPrice - qm.head.price) * 0.1;
      return qm.direction === 'bearish' ? entryPrice - (qm.head.price - entryPrice + buffer) : entryPrice + (entryPrice - qm.head.price + buffer);
    }
    const candidates = qm.direction === 'bearish'
      ? structuralTargets.filter(p => p < entryPrice)
      : structuralTargets.filter(p => p > entryPrice);
    if (candidates.length === 0) return structuralTargets[0];
    return qm.direction === 'bearish' ? Math.max(...candidates) : Math.min(...candidates);
  }

  positionSize(accountBalance, riskPercent, entry, sl) {
    const riskAmount = accountBalance * (riskPercent / 100);
    const perOzRisk = Math.abs(entry - sl);
    if (perOzRisk === 0) return { riskAmount, lots: 0 };
    const ounces = riskAmount / perOzRisk;
    const lots = ounces / this.config.contractSize;
    return { riskAmount, ounces: Math.round(ounces * 100) / 100, lots: Math.round(lots * 1000) / 1000 };
  }

  /** Daily risk gate (Section 51). */
  checkDailyLimits(dailyStats) {
    const c = this.config;
    const reasons = [];
    if (dailyStats.riskUsedPercent >= c.maxDailyRiskPercent) reasons.push('MAX_DAILY_RISK');
    if (dailyStats.tradesToday >= c.maxTradesPerDay) reasons.push('MAX_TRADES_PER_DAY');
    if (dailyStats.openSetups >= c.maxSimultaneousSetups) reasons.push('MAX_SIMULTANEOUS_SETUPS');
    return { paused: reasons.length > 0, reasons };
  }
}
