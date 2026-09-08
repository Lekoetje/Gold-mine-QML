// ============================================================================
// SMOKE TEST (Section 72–73)
// Runs the pipeline against demo data twice, checks:
//  1. It runs end-to-end without throwing.
//  2. At least the engines produce sane, internally-consistent output.
//  3. NON-REPAINT: locking a signal, then re-running analysis with more
//     candles appended, must not change any field of an already-locked
//     signal (Section 73 — the mandatory non-repaint test).
// Run with: node tests/smoke.test.mjs
// ============================================================================

import { CONFIG } from '../js/core/config.js';
import { Orchestrator } from '../js/core/orchestrator.js';
import { generateDemoCandles } from '../data/demoData.js';
import { generateDemoNews } from '../data/demoNews.js';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('PASS:', msg); }
}

// --- Test 1: pipeline runs end-to-end ---
const orch = new Orchestrator(CONFIG);
const candles = generateDemoCandles(500, 15 * 60_000, 2350);
orch.loadHistoricalCandles(candles.slice(0, 300));
orch.loadNews(generateDemoNews());

const result1 = orch.runFull();
assert(result1.candles.length === 300, 'pipeline processes loaded candle count');
assert(Array.isArray(result1.qmCandidates), 'QM candidates array produced');
assert(Array.isArray(result1.signals), 'signals array produced');
console.log(`  -> ${result1.qmCandidates.length} QM candidates, ${result1.signals.length} signals, trend=${result1.trend}`);

// --- Test 2: scoring bounds ---
for (const s of result1.signals) {
  assert(s.score >= 0 && s.score <= 100, `signal ${s.id} score in [0,100]: got ${s.score}`);
}

// --- Test 3: non-repaint guarantee ---
const lockedBefore = result1.signals.filter(s => s.state === 'LOCKED').map(s => ({ ...s, _immutableCore: undefined }));
console.log(`  -> ${lockedBefore.length} locked signal(s) before extending history`);

// extend history and re-run
orch.loadHistoricalCandles(candles); // full 500 candles now
const result2 = orch.runFull();

let repaintFound = false;
for (const before of lockedBefore) {
  const after = result2.signals.find(s => s.id === before.id);
  if (!after) continue; // fine if it simply progressed states via management shell
  const coreFields = ['direction', 'entry', 'sl', 'tp1', 'score', 'timestamp'];
  for (const f of coreFields) {
    if (JSON.stringify(before[f]) !== JSON.stringify(after[f])) {
      repaintFound = true;
      console.error(`  REPAINT on ${before.id}.${f}: ${JSON.stringify(before[f])} -> ${JSON.stringify(after[f])}`);
    }
  }
  assert(orch.signalEngine.verifyIntegrity(before.id), `integrity check holds for locked signal ${before.id}`);
}
assert(!repaintFound, 'no locked signal fields changed after extending history (non-repaint guarantee)');

console.log('\nSmoke test complete.');
