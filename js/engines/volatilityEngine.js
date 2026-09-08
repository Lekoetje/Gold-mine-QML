// ============================================================================
// VOLATILITY ENGINE (Section 25)
// Computes a rolling ATR series and classifies current volatility relative
// to its own recent median, so bands adapt to instrument/timeframe instead
// of using a fixed pip threshold.
// ============================================================================

export class VolatilityEngine {
  constructor(config) {
    this.period = config.volatility.atrPeriod;
    this.bands = config.volatility.bands;
    this.atrSeries = [];
  }

  /** Returns an ATR value per candle (same length as input, warm-up = null). */
  update(candles) {
    const trs = [];
    for (let i = 0; i < candles.length; i++) {
      if (i === 0) { trs.push(candles[i].high - candles[i].low); continue; }
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - prevClose),
        Math.abs(candles[i].low - prevClose)
      );
      trs.push(tr);
    }

    const atr = [];
    for (let i = 0; i < trs.length; i++) {
      if (i < this.period - 1) { atr.push(null); continue; }
      const slice = trs.slice(i - this.period + 1, i + 1);
      atr.push(slice.reduce((a, b) => a + b, 0) / this.period);
    }

    this.atrSeries = atr;
    return atr;
  }

  classify(index) {
    const atr = this.atrSeries[index];
    if (atr == null) return 'UNKNOWN';
    const validAtrs = this.atrSeries.filter(v => v != null);
    const sorted = [...validAtrs].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || atr;
    const ratio = median > 0 ? atr / median : 1;

    if (ratio >= this.bands.high) return 'EXTREME';
    if (ratio >= this.bands.normal) return 'HIGH';
    if (ratio >= this.bands.low) return 'NORMAL';
    return 'LOW';
  }

  getCurrentATR() {
    return this.atrSeries[this.atrSeries.length - 1] ?? null;
  }

  getSeries() {
    return this.atrSeries;
  }
}
