// ============================================================================
// SWING ENGINE
// Detects pivot highs/lows using a configurable left/right bar sensitivity.
// A pivot at index i is CONFIRMED only once `sensitivity` bars exist on its
// right side — this is what makes historical swings stable (Section 7).
// Small legs (below minLegSizeATRMult * ATR) are filtered as noise.
// ============================================================================

export class SwingEngine {
  constructor(config) {
    this.sensitivity = config.swing.sensitivity;
    this.minLegSizeATRMult = config.swing.minLegSizeATRMult;
    this.swings = []; // { index, type: 'high'|'low', price, timestamp, confirmed }
  }

  /**
   * Recompute confirmed swings from a full closed-candle array + matching ATR series.
   * Designed to be called incrementally (cheap enough for realtime use given
   * typical candle counts); for very large histories, swap in an incremental
   * pivot tracker.
   */
  update(candles, atrSeries) {
    const n = candles.length;
    const s = this.sensitivity;
    const swings = [];

    for (let i = s; i < n - s; i++) {
      const window = candles.slice(i - s, i + s + 1);
      const c = candles[i];
      const isHigh = window.every(w => w.high <= c.high);
      const isLow = window.every(w => w.low >= c.low);
      const atr = atrSeries[i] || atrSeries[atrSeries.length - 1] || 0;

      if (isHigh) {
        this._pushIfSignificant(swings, { index: i, type: 'high', price: c.high, timestamp: c.bucketStart, confirmed: true }, atr);
      } else if (isLow) {
        this._pushIfSignificant(swings, { index: i, type: 'low', price: c.low, timestamp: c.bucketStart, confirmed: true }, atr);
      }
    }

    // Trailing unconfirmed candles (last `sensitivity` bars) — expose as developing info only
    this.swings = swings;
    return swings;
  }

  _pushIfSignificant(swings, candidate, atr) {
    const last = swings[swings.length - 1];
    if (last && last.type === candidate.type) {
      // same-type consecutive pivot: keep the more extreme one
      const better = candidate.type === 'high'
        ? candidate.price > last.price
        : candidate.price < last.price;
      if (better) swings[swings.length - 1] = candidate;
      return;
    }
    if (last) {
      const legSize = Math.abs(candidate.price - last.price);
      if (atr > 0 && legSize < atr * this.minLegSizeATRMult) return; // noise filter
    }
    swings.push(candidate);
  }

  getSwings() {
    return this.swings;
  }
}
