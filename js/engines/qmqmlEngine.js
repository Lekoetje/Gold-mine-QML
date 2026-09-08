// ============================================================================
// QM / QML ENGINE (Sections 8, 12, 13, 14) — the heart of the system.
//
// Bearish QM sequence (mirrored for bullish, see _detectDirection):
//   bullish structure -> significant high -> significant low ->
//   new higher high (= QM head) -> break of the preceding low ->
//   the earlier significant high becomes the QML reference ->
//   price retraces to QML -> reaction -> SELL candidate
//
// A QML is represented as a ZONE (not a single price), width scaled by ATR,
// and tracked through Fresh -> Tested -> Consumed / Stale.
// ============================================================================

export class QMQMLEngine {
  constructor(config) {
    this.config = config;
  }

  /**
   * @returns array of QM candidate objects, each carrying its own QML zone
   * and state. This does not decide entries — that's the Confirmation +
   * Signal Engines' job (Section 78: pattern recognition stays separate
   * from trade qualification).
   */
  detect(candles, labeledSwings, structureEngine, atrSeries) {
    const candidates = [];
    candidates.push(...this._detectDirection(candles, labeledSwings, structureEngine, atrSeries, 'bearish'));
    candidates.push(...this._detectDirection(candles, labeledSwings, structureEngine, atrSeries, 'bullish'));
    return candidates.sort((a, b) => a.headIndex - b.headIndex);
  }

  _detectDirection(candles, swings, structureEngine, atrSeries, direction) {
    const out = [];
    const headType = direction === 'bearish' ? 'high' : 'low';   // QM head is a new extreme
    const shoulderType = direction === 'bearish' ? 'high' : 'low'; // left shoulder same type as head, earlier one
    const breakType = direction === 'bearish' ? 'low' : 'high';   // structural point that must break

    const typed = swings.filter(s => s.type === headType);

    for (let i = 1; i < typed.length; i++) {
      const shoulder = typed[i - 1];
      const head = typed[i];

      const isNewExtreme = direction === 'bearish' ? head.price > shoulder.price : head.price < shoulder.price;
      if (!isNewExtreme) continue;

      // Trend Filter (Section 54): require a real prior trend, not sideways noise
      if (!structureEngine.hadRealTrendBefore(shoulder.index)) continue;

      // find the breakType swing sitting between shoulder and head (the "preceding low/high")
      const between = swings.find(s => s.type === breakType && s.index > shoulder.index && s.index < head.index);
      if (!between) continue;

      // find BOS: a close beyond `between.price` after the head
      const bos = this._findBOS(candles, head.index, between.price, direction);
      if (!bos) continue;

      const atr = atrSeries[head.index] || atrSeries[atrSeries.length - 1] || 0;
      const zoneWidth = atr * this.config.qml.zoneWidthATRMult;
      const qmlPrice = shoulder.price;
      const qmlZone = direction === 'bearish'
        ? { low: qmlPrice - zoneWidth, high: qmlPrice + zoneWidth }
        : { low: qmlPrice - zoneWidth, high: qmlPrice + zoneWidth };

      const distortion = this._evaluateDistortion(shoulder, head, between, direction);

      out.push({
        id: `${direction}-${head.index}`,
        direction,
        shoulder,
        head,
        headIndex: head.index,
        breakSwing: between,
        bos,
        qmlZone,
        qmlPrice,
        state: 'DEVELOPING', // DEVELOPING -> ARMED -> CONFIRMED -> INVALIDATED / STALE
        tests: 0,
        ftbDone: false,
        firstTouchIndex: null,
        distortion
      });
    }

    return out;
  }

  _findBOS(candles, fromIndex, level, direction) {
    const useClose = this.config.bos.useCloseConfirmation;
    for (let j = fromIndex + 1; j < candles.length; j++) {
      const c = candles[j];
      const price = useClose ? c.close : (direction === 'bearish' ? c.low : c.high);
      const broke = direction === 'bearish' ? price < level : price > level;
      if (broke) return { index: j, level, timestamp: c.bucketStart };
    }
    return null;
  }

  _evaluateDistortion(shoulder, head, between, direction) {
    // Section 55: shoulder distance, head extension, symmetry — a light heuristic,
    // not a hard rejection filter (distorted QMs get scored lower, not discarded).
    const legOut = Math.abs(head.price - between.price);
    const legIn = Math.abs(shoulder.price - between.price);
    const symmetry = legOut > 0 ? Math.min(legIn, legOut) / Math.max(legIn, legOut) : 0;
    const headExtension = Math.abs(head.price - shoulder.price);
    return { symmetry, headExtension };
  }

  /**
   * Update QML test/FTB/expiration state given new candles.
   * Call after each closed candle (or batch) for every DEVELOPING/ARMED QM.
   */
  updateZoneState(qm, candles, currentIndex) {
    if (['CONFIRMED', 'INVALIDATED', 'STALE'].includes(qm.state)) return qm;

    // Invalidate if the QM head itself gets broken
    const headBroken = qm.direction === 'bearish'
      ? candles[currentIndex].close > qm.head.price
      : candles[currentIndex].close < qm.head.price;
    if (headBroken) { qm.state = 'INVALIDATED'; return qm; }

    // Expiration: too many candles since BOS without a touch
    const candlesSinceBOS = currentIndex - qm.bos.index;
    if (candlesSinceBOS > this.config.qml.expirationCandles && qm.tests === 0) {
      qm.state = 'STALE';
      return qm;
    }
    if (qm.tests >= this.config.qml.maxTestsBeforeStale) {
      qm.state = 'STALE';
      return qm;
    }

    // Touch detection — only count a NEW test when price transitions into
    // the zone from outside it. Without this, a few candles sitting inside
    // a ranging zone would each increment `tests` and burn through
    // maxTestsBeforeStale in a handful of bars, going STALE before the
    // reaction/confirmation logic ever gets evaluated.
    const c = candles[currentIndex];
    const touched = c.low <= qm.qmlZone.high && c.high >= qm.qmlZone.low;
    if (touched && currentIndex > qm.bos.index) {
      if (!qm._inZone) {
        qm.tests += 1;
        if (!qm.ftbDone) {
          qm.ftbDone = true;
          qm.firstTouchIndex = currentIndex;
        }
      }
      qm._inZone = true;
      qm.state = 'ARMED'; // touched, now watching for reaction (Confirmation Engine decides CONFIRMED)
    } else {
      qm._inZone = false;
    }

    return qm;
  }

  freshnessScore(qm) {
    const f = this.config.qml.freshnessBonus;
    if (qm.tests === 0) return f.fresh;
    if (qm.tests === 1) return f.oneTest;
    if (qm.tests === 2) return f.twoTests;
    return f.manyTests;
  }
}
