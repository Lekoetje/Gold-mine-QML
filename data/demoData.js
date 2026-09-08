// ============================================================================
// DEMO DATA (Section 68) — offline/demo mode.
// Generates a synthetic but structurally realistic XAU/USD candle series
// (deliberately includes swing sequences that trigger QM patterns) so the
// full pipeline can be exercised with zero external dependencies. This is
// SYNTHETIC data and must never be presented to the user as real market data.
// ============================================================================

export function generateDemoCandles(count = 400, timeframeMs = 15 * 60_000, startPrice = 2350) {
  const candles = [];
  let price = startPrice;
  let t = Date.now() - count * timeframeMs;
  let phase = 0; // used to inject deliberate swing structure

  // simple pseudo-random but deterministic generator so results are reproducible
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let i = 0; i < count; i++) {
    // inject a slow sine-wave trend component + noise so real swing/QM
    // structures naturally emerge, plus occasional volatility spikes
    const trend = Math.sin(i / 40) * 8;
    const spike = (i % 97 === 0) ? (rand() - 0.5) * 15 : 0;
    const noise = (rand() - 0.5) * 3.2;

    const open = price;
    const drift = trend * 0.05 + noise + spike * 0.3;
    const close = open + drift;
    const wick = Math.abs(noise) + Math.abs(spike) * 0.5 + rand() * 1.5;
    const high = Math.max(open, close) + wick * rand();
    const low = Math.min(open, close) - wick * rand();

    candles.push({
      bucketStart: t,
      timeframe: 'M15',
      open: round(open),
      high: round(high),
      low: round(low),
      close: round(close),
      volume: Math.round(50 + rand() * 200),
      closed: true
    });

    price = close;
    t += timeframeMs;
  }

  return candles;
}

function round(v) {
  return Math.round(v * 100) / 100;
}
