// ============================================================================
// MARKET STRUCTURE ENGINE
// Labels each confirmed swing as HH / HL / LH / LL relative to the prior
// swing of the same type, and tracks a simple trend state used by the
// Trend Filter (Section 54) so reversal QMs require a real prior trend.
// ============================================================================

export class MarketStructureEngine {
  constructor() {
    this.labeled = []; // swings with a `label` field added
    this.trend = 'UNKNOWN'; // 'BULLISH' | 'BEARISH' | 'RANGING' | 'UNKNOWN'
  }

  update(swings) {
    const labeled = [];
    let lastHigh = null, lastLow = null;

    for (const sw of swings) {
      let label = null;
      if (sw.type === 'high') {
        if (lastHigh) label = sw.price > lastHigh.price ? 'HH' : 'LH';
        lastHigh = sw;
      } else {
        if (lastLow) label = sw.price > lastLow.price ? 'HL' : 'LL';
        lastLow = sw;
      }
      labeled.push({ ...sw, label });
    }

    this.labeled = labeled;
    this.trend = this._deriveTrend(labeled);
    return { swings: labeled, trend: this.trend };
  }

  _deriveTrend(labeled) {
    const recent = labeled.slice(-5).map(s => s.label).filter(Boolean);
    if (recent.length < 2) return 'UNKNOWN';
    const bullish = recent.filter(l => l === 'HH' || l === 'HL').length;
    const bearish = recent.filter(l => l === 'LH' || l === 'LL').length;
    if (bullish >= 3 && bearish === 0) return 'BULLISH';
    if (bearish >= 3 && bullish === 0) return 'BEARISH';
    if (bullish > 0 && bearish > 0) return 'TRANSITION';
    return 'RANGING';
  }

  /**
   * Trend Filter (Section 54): did a real trend exist before this point,
   * so a reversal QM here is meaningful rather than noise in a range?
   */
  hadRealTrendBefore(index, minSwingCount = 4) {
    const priorLabeled = this.labeled.filter(s => s.index < index && s.label);
    if (priorLabeled.length < minSwingCount) return false;
    const last = priorLabeled.slice(-minSwingCount);
    const bullish = last.every(s => s.label === 'HH' || s.label === 'HL');
    const bearish = last.every(s => s.label === 'LH' || s.label === 'LL');
    return bullish || bearish;
  }

  getLabeledSwings() {
    return this.labeled;
  }

  getTrend() {
    return this.trend;
  }
}
