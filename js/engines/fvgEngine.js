// ============================================================================
// FAIR VALUE GAP ENGINE (Section 21)
// A bullish FVG: candle[i-1].high < candle[i+1].low (a gap left by candle i's
// displacement). Bearish FVG: candle[i-1].low > candle[i+1].high.
// Confluence bonus when a QML zone overlaps a same-direction FVG — absence
// of an FVG never invalidates a QM (Section 21).
// ============================================================================

export class FVGEngine {
  detect(candles) {
    const gaps = [];
    for (let i = 1; i < candles.length - 1; i++) {
      const prev = candles[i - 1];
      const next = candles[i + 1];

      if (prev.high < next.low) {
        gaps.push({ type: 'bullish', low: prev.high, high: next.low, index: i });
      } else if (prev.low > next.high) {
        gaps.push({ type: 'bearish', low: next.high, high: prev.low, index: i });
      }
    }
    return gaps;
  }

  overlapsQML(gaps, qm) {
    const wantType = qm.direction === 'bearish' ? 'bearish' : 'bullish';
    return gaps.some(g =>
      g.type === wantType &&
      g.index < qm.head.index &&
      g.low <= qm.qmlZone.high && g.high >= qm.qmlZone.low
    );
  }
}
