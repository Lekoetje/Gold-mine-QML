// ============================================================================
// SCORING ENGINE (Sections 30–32)
// Produces the QM ALIGNMENT SCORE — an alignment-with-the-rules score,
// explicitly NOT a win probability (Section 30). Weights are configurable
// and initial (Section 31) — not claimed to be statistically optimal.
// ============================================================================

export class ScoringEngine {
  constructor(config) {
    this.weights = config.scoring.weights;
    this.thresholds = config.scoring.thresholds;
  }

  /**
   * @param {object} inputs - collected booleans/grades/scores from other engines:
   *   qmValid, qmlQuality (0..1), sweepGrade ('Strong'|'Moderate'|'Weak'|null),
   *   bosQuality (0..1), ftbDone (bool), htfAlignment (0..1), divergence
   *   ('none'|'valid'|'strong'), confluence (0..1), volatilityClass, sessionBonus (0..1),
   *   newsRisk ('LOW'|'MEDIUM'|'HIGH')
   */
  score(inputs) {
    const w = this.weights;
    let total = 0;
    const breakdown = {};

    const add = (key, weight, fraction) => {
      const points = weight * Math.max(0, Math.min(1, fraction));
      breakdown[key] = Math.round(points * 10) / 10;
      total += points;
    };

    add('qmStructure', w.qmStructure, inputs.qmValid ? 1 : 0);
    add('qmlQuality', w.qmlQuality, inputs.qmlQuality ?? 0);

    const sweepFraction = { Strong: 1, Moderate: 0.6, Weak: 0.3, null: 0 }[inputs.sweepGrade ?? 'null'];
    add('liquiditySweep', w.liquiditySweep, sweepFraction);

    add('bosDisplacement', w.bosDisplacement, inputs.bosQuality ?? 0);
    add('ftb', w.ftb, inputs.ftbDone ? 1 : 0.3);
    add('htfAlignment', w.htfAlignment, inputs.htfAlignment ?? 0.5);

    const divFraction = { none: 0, valid: 0.7, strong: 1 }[inputs.divergence ?? 'none'];
    add('divergence', w.divergence, divFraction);

    add('confluence', w.confluence, inputs.confluence ?? 0);

    const volFraction = { LOW: 0.5, NORMAL: 1, HIGH: 0.5, EXTREME: 0, UNKNOWN: 0.5 }[inputs.volatilityClass ?? 'UNKNOWN'];
    add('volatility', w.volatility, volFraction);

    add('session', w.session, inputs.sessionBonus ?? 0.5);

    const newsFraction = { LOW: 1, MEDIUM: 0.5, HIGH: 0.1 }[inputs.newsRisk ?? 'LOW'];
    add('fundamentals', w.fundamentals, newsFraction);

    const roundedTotal = Math.round(total * 10) / 10;
    return { total: roundedTotal, breakdown, classification: this.classify(roundedTotal) };
  }

  classify(score) {
    const t = this.thresholds;
    if (score >= t.exceptional) return 'EXCEPTIONAL';
    if (score >= t.highQuality) return 'HIGH_QUALITY';
    if (score >= t.quality) return 'QUALITY';
    if (score >= t.watch) return 'WATCH';
    if (score >= t.weak) return 'WEAK';
    return 'WAIT';
  }
}
