// ============================================================================
// FIBONACCI ENGINE (Section 22)
// Optional confluence only — never overrides market structure. Checks
// whether a QML zone sits near the 50% or 61.8% retracement of the QM's
// shoulder-to-head leg. 61.8% gets a stronger confluence weight than 50%.
// ============================================================================

export class FibonacciEngine {
  constructor(config) {
    this.toleranceATRMult = 0.25;
  }

  /** Returns 'none' | 'fifty' | 'goldenRatio' for a given QM candidate. */
  checkConfluence(qm, atr) {
    const legHigh = Math.max(qm.shoulder.price, qm.head.price);
    const legLow = Math.min(qm.shoulder.price, qm.head.price);
    const legSize = legHigh - legLow;
    if (legSize === 0) return 'none';

    const fifty = legLow + legSize * 0.5;
    const golden = legLow + legSize * 0.382; // measured from the head side inward — equivalent to 61.8% retrace from the extreme
    const tolerance = atr * this.toleranceATRMult;

    const qmlMid = (qm.qmlZone.low + qm.qmlZone.high) / 2;

    if (Math.abs(qmlMid - golden) <= tolerance) return 'goldenRatio';
    if (Math.abs(qmlMid - fifty) <= tolerance) return 'fifty';
    return 'none';
  }
}
