// ============================================================================
// TIMEFRAME RESAMPLER
// Aggregates a lower-timeframe candle series (e.g. M15) into higher
// timeframes (H1/H4/D1) so real HTF structure can be derived instead of
// being fed in manually. Only fully-formed buckets are returned — an
// in-progress higher-TF bucket is dropped to preserve no-look-ahead
// (Section 39): we never let a partial D1 candle imply a "confirmed" trend.
// ============================================================================

const TF_MS = {
  M1: 60_000, M5: 5 * 60_000, M15: 15 * 60_000, M30: 30 * 60_000,
  H1: 60 * 60_000, H4: 4 * 60 * 60_000, D1: 24 * 60 * 60_000
};

export function resampleCandles(sourceCandles, targetTimeframe) {
  const bucketMs = TF_MS[targetTimeframe];
  if (!bucketMs) throw new Error(`Unknown timeframe: ${targetTimeframe}`);
  if (sourceCandles.length === 0) return [];

  const buckets = new Map();
  const order = [];

  for (const c of sourceCandles) {
    const bucketStart = Math.floor(c.bucketStart / bucketMs) * bucketMs;
    let b = buckets.get(bucketStart);
    if (!b) {
      b = { bucketStart, timeframe: targetTimeframe, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0, closed: false, _lastSourceEnd: c.bucketStart };
      buckets.set(bucketStart, b);
      order.push(bucketStart);
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close;
      b.volume += (c.volume || 0);
      b._lastSourceEnd = c.bucketStart;
    }
  }

  // The final bucket is almost certainly still forming (we don't know if
  // more lower-TF candles would still land in it) — drop it.
  const closedBuckets = order.slice(0, -1).map(k => {
    const b = buckets.get(k);
    b.closed = true;
    delete b._lastSourceEnd;
    return b;
  });

  return closedBuckets;
}
