// ============================================================================
// CONFIRMATION ENGINE (Sections 14, 19, 18)
// A touch of the QML zone is not enough on its own. This engine checks for
// a qualifying reaction (rejection wick / engulfing / displacement away),
// evaluates higher-timeframe alignment, and computes RSI divergence as an
// optional bonus signal.
// ============================================================================

export class ConfirmationEngine {
  constructor(config) {
    this.config = config;
  }

  /**
   * Returns { reacted: bool, kind: string|null } for the candle(s) following
   * the first touch of a QM's QML zone.
   */
  checkQMLReaction(qm, candles, atrSeries) {
    if (!qm.ftbDone || qm.firstTouchIndex == null) return { reacted: false, kind: null };

    const touchIdx = qm.firstTouchIndex;
    const touch = candles[touchIdx];
    const atr = atrSeries[touchIdx] || 0;
    const next = candles[touchIdx + 1];

    // Rejection wick: long wick back out of the zone on the touch candle
    const wickSize = qm.direction === 'bearish'
      ? touch.high - Math.max(touch.open, touch.close)
      : Math.min(touch.open, touch.close) - touch.low;
    if (atr > 0 && wickSize >= atr * 0.4) {
      return { reacted: true, kind: 'rejection_wick' };
    }

    if (next) {
      // Engulfing: next candle's body engulfs the touch candle's body, in the trade direction
      const engulfs = qm.direction === 'bearish'
        ? next.close < touch.low && next.open > touch.close
        : next.close > touch.high && next.open < touch.close;
      if (engulfs) return { reacted: true, kind: 'engulfing' };

      // Displacement away from the zone
      const body = Math.abs(next.close - next.open);
      const movedAway = qm.direction === 'bearish' ? next.close < qm.qmlZone.low : next.close > qm.qmlZone.high;
      if (movedAway && atr > 0 && body >= atr * this.config.displacement.minBodyATRMult) {
        return { reacted: true, kind: 'displacement' };
      }
    }

    return { reacted: false, kind: null };
  }

  /**
   * HTF alignment (Section 19): compares the QM's implied direction against
   * a supplied stack of higher-timeframe trend states, e.g.
   * { D1: 'BULLISH', H4: 'NEUTRAL', H1: 'BULLISH' }.
   */
  htfAlignment(qm, htfTrends) {
    const wanted = qm.direction === 'bearish' ? 'BEARISH' : 'BULLISH';
    const entries = Object.entries(htfTrends);
    let aligned = 0, conflicting = 0;
    for (const [, trend] of entries) {
      if (trend === wanted || trend === 'NEUTRAL') aligned++;
      else conflicting++;
    }
    const score = entries.length > 0 ? aligned / entries.length : 0.5;
    return { score, aligned, conflicting, total: entries.length, conflictDetected: conflicting > 0 };
  }

  /** Simple RSI for divergence detection (Section 18) — computed, not charted by default. */
  computeRSI(candles, period) {
    const rsi = new Array(candles.length).fill(null);
    let gains = 0, losses = 0;
    for (let i = 1; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      const gain = Math.max(change, 0);
      const loss = Math.max(-change, 0);
      if (i <= period) {
        gains += gain; losses += loss;
        if (i === period) {
          const avgGain = gains / period, avgLoss = losses / period;
          rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        }
        continue;
      }
      const prevAvgGain = (rsi[i - 1] === null) ? gain : gains;
      // Wilder's smoothing using running averages
      gains = (gains * (period - 1) + gain) / period;
      losses = (losses * (period - 1) + loss) / period;
      rsi[i] = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
    }
    return rsi;
  }

  /**
   * Detect divergence between price and RSI around the QM head.
   * Returns 'none' | 'valid' | 'strong'.
   */
  checkDivergence(qm, candles, rsiSeries) {
    const headIdx = qm.head.index;
    const lookback = 15;
    const start = Math.max(0, headIdx - lookback);
    if (headIdx <= 0 || rsiSeries[headIdx] == null) return 'none';

    // find the comparable prior extreme in the same window
    let priorIdx = start;
    for (let i = start; i < headIdx; i++) {
      const better = qm.direction === 'bearish'
        ? candles[i].high > candles[priorIdx].high
        : candles[i].low < candles[priorIdx].low;
      if (better) priorIdx = i;
    }
    if (rsiSeries[priorIdx] == null) return 'none';

    if (qm.direction === 'bearish') {
      const higherPrice = candles[headIdx].high > candles[priorIdx].high;
      const lowerRSI = rsiSeries[headIdx] < rsiSeries[priorIdx];
      if (higherPrice && lowerRSI) {
        const gap = rsiSeries[priorIdx] - rsiSeries[headIdx];
        return gap >= 10 ? 'strong' : 'valid';
      }
    } else {
      const lowerPrice = candles[headIdx].low < candles[priorIdx].low;
      const higherRSI = rsiSeries[headIdx] > rsiSeries[priorIdx];
      if (lowerPrice && higherRSI) {
        const gap = rsiSeries[headIdx] - rsiSeries[priorIdx];
        return gap >= 10 ? 'strong' : 'valid';
      }
    }
    return 'none';
  }
}
