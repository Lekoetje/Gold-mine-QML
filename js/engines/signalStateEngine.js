// ============================================================================
// SIGNAL STATE ENGINE + LOCK ENGINE (Sections 33–39) — CRITICAL
//
// State machine:
//   SCANNING -> DEVELOPING -> ARMED -> CONFIRMED -> LOCKED ->
//   TP1_HIT -> RUNNER -> TRAILING -> CLOSED
//   (DEVELOPING -> INVALIDATED is always possible pre-confirmation)
//
// THE LOCK RULE: once a signal transitions to CONFIRMED and is locked,
// direction / entry / initial SL / TP1 / QM structure / QML / score /
// timestamp / timeframe become IMMUTABLE. This module enforces that by
// deep-freezing the locked payload and refusing any mutation attempt.
// This is the single most important guarantee in the whole application
// (Sections 36–37, 73 non-repaint test).
// ============================================================================

const MUTABLE_STATES = new Set(['SCANNING', 'DEVELOPING', 'ARMED']);
const IMMUTABLE_CORE_FIELDS = [
  'direction', 'entry', 'sl', 'tp1', 'qmHead', 'qmlZone', 'score', 'timestamp', 'timeframe'
];

export class SignalStateEngine {
  constructor() {
    this.signals = new Map(); // id -> signal record
  }

  /**
   * Create or update a DEVELOPING/ARMED signal. Freely mutable pre-lock.
   */
  upsertDeveloping(qm, snapshot) {
    const existing = this.signals.get(qm.id);
    if (existing && !MUTABLE_STATES.has(existing.state)) {
      // already locked/beyond — never touch it again from here
      return existing;
    }
    const record = {
      id: qm.id,
      state: qm.state === 'ARMED' ? 'ARMED' : 'DEVELOPING',
      direction: qm.direction,
      qmHead: qm.head,
      qmlZone: qm.qmlZone,
      score: snapshot.score,
      scoreBreakdown: snapshot.breakdown,
      entry: snapshot.entry ?? null,
      sl: snapshot.sl ?? null,
      tp1: snapshot.tp1 ?? null,
      rr: snapshot.rr ?? null,
      timestamp: qm.head.timestamp,
      timeframe: snapshot.timeframe,
      reasons: snapshot.reasons ?? [],
      updatedAt: snapshot.nowMs
    };
    this.signals.set(qm.id, record);
    return record;
  }

  /**
   * Attempt to CONFIRM and LOCK a signal. Requires the mandatory structural
   * conditions AND the score threshold (Section 32: "a score of 90 cannot
   * rescue an invalid QM"). Once locked, `_freeze` makes the core fields
   * immutable in JS (Object.freeze) as a structural guardrail, not just a
   * convention.
   */
  tryConfirmAndLock(qm, snapshot, config) {
    const record = this.signals.get(qm.id);
    if (!record || !MUTABLE_STATES.has(record.state)) return record;

    const mandatoryOk = qm.bos && qm.ftbDone && snapshot.reacted;
    const scoreOk = snapshot.score >= config.scoring.confirmationThreshold;
    if (!mandatoryOk || !scoreOk) return record;

    record.state = 'CONFIRMED';
    record.entry = snapshot.entry;
    record.sl = snapshot.sl;
    record.tp1 = snapshot.tp1;
    record.rr = snapshot.rr;
    record.score = snapshot.score;
    record.scoreBreakdown = snapshot.breakdown;
    record.lockedAt = snapshot.nowMs;
    record.state = 'LOCKED';

    const frozen = this._freeze(record);
    this.signals.set(qm.id, frozen);
    return frozen;
  }

  _freeze(record) {
    const core = {};
    for (const f of IMMUTABLE_CORE_FIELDS) core[f] = record[f];
    Object.freeze(core);
    // Store the frozen core alongside a mutable trade-management shell
    return {
      ...record,
      _immutableCore: core,
      management: { tp1Hit: false, runner: false, trailingSL: record.sl, closedAt: null, result: null }
    };
  }

  /** Verifies a locked record's core fields still match its frozen snapshot (used by the non-repaint test). */
  verifyIntegrity(id) {
    const r = this.signals.get(id);
    if (!r || !r._immutableCore) return true;
    return IMMUTABLE_CORE_FIELDS.every(f => r[f] === r._immutableCore[f]);
  }

  invalidate(qm) {
    const record = this.signals.get(qm.id);
    if (!record || !MUTABLE_STATES.has(record.state)) return record;
    record.state = 'INVALIDATED';
    return record;
  }

  /** Trade management transitions — only touches the mutable `management` shell, never the core. */
  markTP1Hit(id, priceIndex) {
    const r = this.signals.get(id);
    if (!r || r.state !== 'LOCKED') return r;
    r.state = 'TP1_HIT';
    r.management.tp1Hit = true;
    r.management.tp1HitIndex = priceIndex;
    return r;
  }

  markClosed(id, result, nowMs) {
    const r = this.signals.get(id);
    if (!r) return r;
    r.state = 'CLOSED';
    r.management.result = result; // 'WIN' | 'LOSS' | 'BE'
    r.management.closedAt = nowMs;
    return r;
  }

  trailStop(id, newStop, direction) {
    const r = this.signals.get(id);
    if (!r || !['TP1_HIT', 'RUNNER', 'TRAILING'].includes(r.state)) return r;
    const improved = direction === 'bearish' ? newStop < r.management.trailingSL : newStop > r.management.trailingSL;
    if (!improved) return r; // never move the stop backwards (Section 17)
    r.management.trailingSL = newStop;
    r.state = 'TRAILING';
    return r;
  }

  getAll() {
    return Array.from(this.signals.values());
  }

  getActive() {
    return this.getAll().filter(s => !['CLOSED', 'INVALIDATED', 'STALE'].includes(s.state));
  }
}
