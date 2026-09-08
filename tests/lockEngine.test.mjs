// ============================================================================
// LOCK ENGINE UNIT TEST — deterministic, doesn't depend on demo data
// producing a qualifying setup. Directly exercises upsertDeveloping ->
// tryConfirmAndLock -> mutation-after-lock rejection -> integrity check.
// Run with: node tests/lockEngine.test.mjs
// ============================================================================

import { SignalStateEngine } from '../js/engines/signalStateEngine.js';
import { CONFIG } from '../js/core/config.js';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('PASS:', msg); }
}

const engine = new SignalStateEngine();

const qm = {
  id: 'bearish-test-1',
  direction: 'bearish',
  head: { price: 2400, timestamp: 1000, index: 50 },
  qmlZone: { low: 2380, high: 2390 },
  bos: { index: 55 },
  ftbDone: true,
  state: 'ARMED'
};

// 1. Developing snapshot, score below threshold — should NOT lock
let snap = { score: 60, breakdown: {}, entry: 2385, sl: 2402, tp1: 2360, rr: 1.1, timeframe: 'M15', nowMs: 2000 };
engine.upsertDeveloping(qm, snap);
let locked = engine.tryConfirmAndLock(qm, { ...snap, reacted: true }, CONFIG);
assert(locked.state !== 'LOCKED', 'low score does not lock even with mandatory conditions met');

// 2. Score above threshold, but no reaction — should NOT lock
snap = { ...snap, score: 90, nowMs: 3000 };
engine.upsertDeveloping(qm, snap);
locked = engine.tryConfirmAndLock(qm, { ...snap, reacted: false }, CONFIG);
assert(locked.state !== 'LOCKED', 'high score without a QML reaction does not lock');

// 3. Score above threshold AND reaction true -> should lock
snap = { ...snap, score: 90, nowMs: 4000 };
engine.upsertDeveloping(qm, snap);
locked = engine.tryConfirmAndLock(qm, { ...snap, reacted: true }, CONFIG);
assert(locked.state === 'LOCKED', 'mandatory conditions + score threshold locks the signal');
assert(locked.entry === 2385 && locked.sl === 2402 && locked.tp1 === 2360, 'locked levels match the confirming snapshot');

const originalEntry = locked.entry;

// 4. Attempt to "repaint" via upsertDeveloping again with different numbers — must be ignored
const tamperSnap = { score: 20, breakdown: {}, entry: 9999, sl: 1, tp1: 1, rr: 99, timeframe: 'M15', nowMs: 5000 };
const afterTamper = engine.upsertDeveloping(qm, tamperSnap);
assert(afterTamper.entry === originalEntry, 'upsertDeveloping cannot mutate a locked signal');
assert(afterTamper.state === 'LOCKED', 'state remains LOCKED after tamper attempt');

// 5. Direct mutation of the frozen core must silently fail (or throw in strict mode) and not change value
try {
  afterTamper._immutableCore.entry = 1234;
} catch (e) { /* frozen objects throw in strict mode — acceptable */ }
assert(afterTamper._immutableCore.entry === originalEntry, 'Object.freeze prevents core field mutation');

// 6. Integrity check passes
assert(engine.verifyIntegrity(qm.id), 'verifyIntegrity confirms record matches frozen core');

// 7. Trade management can still progress (TP1 hit) without touching core fields
engine.markTP1Hit(qm.id, 120);
const afterTp1 = engine.getAll().find(s => s.id === qm.id);
assert(afterTp1.state === 'TP1_HIT', 'trade management transitions work post-lock');
assert(afterTp1.entry === originalEntry, 'entry unchanged after TP1 transition');

console.log('\nLock engine test complete.');
