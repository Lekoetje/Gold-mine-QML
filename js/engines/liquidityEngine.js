// ============================================================================
// LIQUIDITY ENGINE (Section 9)
// Detects sweeps of meaningful highs/lows: price penetrates the level via
// wick, then rejects back inside range within a configurable window.
// Grades each sweep Strong / Moderate / Weak based on penetration depth,
// rejection speed, and follow-through displacement.
// ============================================================================

export class LiquidityEngine {
  constructor(config) {
    this.minWickATRMult = config.liquiditySweep.minWickPenetrationATRMult;
    this.rejectionMaxCandles = config.liquiditySweep.rejectionMaxCandles;
  }

  /**
   * @param candles closed candle array
   * @param swings labeled swings (from MarketStructureEngine)
   * @param atrSeries ATR per candle
   * @returns array of sweep events
   */
  detectSweeps(candles, swings, atrSeries) {
    const sweeps = [];
    const highs = swings.filter(s => s.type === 'high');
    const lows = swings.filter(s => s.type === 'low');

    for (let i = 0; i < candles.length; i++) {
      const atr = atrSeries[i];
      if (!atr) continue;
      const c = candles[i];

      // Bearish sweep: price wicks above a prior significant high, then rejects
      for (const h of highs) {
        if (h.index >= i) continue;
        const penetration = c.high - h.price;
        if (penetration > 0 && penetration >= atr * this.minWickATRMult && c.close < h.price) {
          const grade = this._grade(candles, i, penetration, atr, 'bearish');
          sweeps.push({ index: i, type: 'bearish', level: h.price, penetration, grade, timestamp: c.bucketStart });
        }
      }

      // Bullish sweep: price wicks below a prior significant low, then rejects
      for (const l of lows) {
        if (l.index >= i) continue;
        const penetration = l.price - c.low;
        if (penetration > 0 && penetration >= atr * this.minWickATRMult && c.close > l.price) {
          const grade = this._grade(candles, i, penetration, atr, 'bullish');
          sweeps.push({ index: i, type: 'bullish', level: l.price, penetration, grade, timestamp: c.bucketStart });
        }
      }
    }

    return sweeps;
  }

  _grade(candles, index, penetration, atr, direction) {
    const depthScore = penetration / atr; // deeper wick = more significant
    let rejectionSpeed = this.rejectionMaxCandles + 1;

    for (let j = 1; j <= this.rejectionMaxCandles && index + j < candles.length; j++) {
      const c = candles[index + j];
      const rejected = direction === 'bearish' ? c.close < candles[index].close : c.close > candles[index].close;
      if (rejected) { rejectionSpeed = j; break; }
    }

    if (depthScore >= 0.5 && rejectionSpeed <= 1) return 'Strong';
    if (depthScore >= 0.25 && rejectionSpeed <= this.rejectionMaxCandles) return 'Moderate';
    return 'Weak';
  }
}
