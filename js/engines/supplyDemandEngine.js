// ============================================================================
// SUPPLY / DEMAND ENGINE (Section 20)
// Detects zones where price consolidated (base) immediately before a strong
// directional departure — the classic "origin of the move" definition.
// Kept deliberately simple and configurable; not meant to replace discretion,
// only to give the scoring engine a real confluence signal instead of a
// placeholder (see orchestrator.js).
// ============================================================================

export class SupplyDemandEngine {
  constructor(config) {
    this.baseMaxCandles = 4;           // consolidation window checked before a departure
    this.baseMaxRangeATRMult = 0.6;    // base must be tighter than this * ATR
    this.departureMinBodyATRMult = config.displacement.minBodyATRMult;
  }

  /** Returns array of zones: { type: 'supply'|'demand', low, high, index, fresh } */
  detect(candles, atrSeries) {
    const zones = [];

    for (let i = this.baseMaxCandles; i < candles.length - 1; i++) {
      const atr = atrSeries[i];
      if (!atr) continue;

      const departure = candles[i + 1];
      if (!departure) continue;
      const body = Math.abs(departure.close - departure.open);
      if (body < atr * this.departureMinBodyATRMult) continue;

      const baseCandles = candles.slice(i - this.baseMaxCandles + 1, i + 1);
      const baseHigh = Math.max(...baseCandles.map(c => c.high));
      const baseLow = Math.min(...baseCandles.map(c => c.low));
      const baseRange = baseHigh - baseLow;
      if (baseRange > atr * this.baseMaxRangeATRMult) continue; // not tight enough to be a "base"

      const departingUp = departure.close > departure.open;
      zones.push({
        type: departingUp ? 'demand' : 'supply',
        low: baseLow,
        high: baseHigh,
        index: i,
        tested: false
      });
    }

    return zones;
  }

  /** Whether a QML zone meaningfully overlaps a same-direction S/D zone (Section 20 bonus). */
  overlapsQML(zones, qm) {
    const wantType = qm.direction === 'bearish' ? 'supply' : 'demand';
    return zones.some(z =>
      z.type === wantType &&
      z.index < qm.head.index &&
      z.low <= qm.qmlZone.high && z.high >= qm.qmlZone.low
    );
  }
}
