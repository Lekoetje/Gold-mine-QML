// ============================================================================
// CANDLE ENGINE
// Converts a stream of ticks (price + timestamp) into OHLC candles for a
// given timeframe. Same logic path is used for live ticks and for replaying
// historical data (Section 40 — candle-by-candle processing, no look-ahead).
// ============================================================================

const TF_MS = {
  M1: 60_000, M5: 5 * 60_000, M15: 15 * 60_000, M30: 30 * 60_000,
  H1: 60 * 60_000, H4: 4 * 60 * 60_000, D1: 24 * 60 * 60_000
};

export class CandleEngine {
  /**
   * @param {string} timeframe e.g. 'M15'
   */
  constructor(timeframe) {
    if (!TF_MS[timeframe]) throw new Error(`Unknown timeframe: ${timeframe}`);
    this.timeframe = timeframe;
    this.tfMs = TF_MS[timeframe];
    this.candles = []; // closed candles, oldest -> newest
    this.current = null; // in-progress candle
    this.listeners = { candleClosed: [], candleUpdated: [] };
  }

  on(event, cb) {
    if (!this.listeners[event]) throw new Error(`Unknown event: ${event}`);
    this.listeners[event].push(cb);
  }

  _emit(event, payload) {
    for (const cb of this.listeners[event]) cb(payload);
  }

  _bucketStart(timestampMs) {
    return Math.floor(timestampMs / this.tfMs) * this.tfMs;
  }

  /**
   * Feed a single tick. Ticks must arrive in non-decreasing timestamp order
   * to preserve the no-look-ahead guarantee (Section 39).
   * @param {{price:number, timestamp:number, bid?:number, ask?:number}} tick
   */
  ingestTick(tick) {
    const bucket = this._bucketStart(tick.timestamp);

    if (!this.current || this.current.bucketStart !== bucket) {
      // close the previous candle, if any
      if (this.current) {
        this.candles.push(this.current);
        this._emit('candleClosed', this.current);
      }
      this.current = {
        bucketStart: bucket,
        timeframe: this.timeframe,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: 1,
        closed: false
      };
    } else {
      this.current.high = Math.max(this.current.high, tick.price);
      this.current.low = Math.min(this.current.low, tick.price);
      this.current.close = tick.price;
      this.current.volume += 1;
    }
    this._emit('candleUpdated', this.current);
  }

  /** Force-close the in-progress candle (e.g. at end of a backtest run). */
  flush() {
    if (this.current && !this.current.closed) {
      this.current.closed = true;
      this.candles.push(this.current);
      this._emit('candleClosed', this.current);
      this.current = null;
    }
  }

  /** Bulk-load already-closed historical candles (for backtest/demo seeding). */
  loadHistory(candles) {
    this.candles = candles.map(c => ({ ...c, timeframe: this.timeframe, closed: true }));
  }

  getClosedCandles() {
    return this.candles;
  }

  getCurrent() {
    return this.current;
  }
}
