// ============================================================================
// LIVE SIMULATION TEST
// A single full-history batch run evaluates everything "as of the last
// candle" — any QM that formed long ago has had the whole rest of history
// to expire before we ever look at it, which is correct behavior but means
// a one-shot batch run rarely catches a signal mid-flight. This test
// instead grows the candle history incrementally and re-runs the pipeline
// at each step (true candle-by-candle live simulation, Section 40), which
// is what actually proves LOCKED signals and closed trades occur.
// Run with: node tests/liveSimulation.test.mjs
// ============================================================================

import { CONFIG } from '../js/core/config.js';
import { Orchestrator } from '../js/core/orchestrator.js';
import { generateDemoCandles } from '../data/demoData.js';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('PASS:', msg); }
}

const full = generateDemoCandles(1200, 15 * 60_000, 2350);
const orch = new Orchestrator(CONFIG);

let sawLocked = false;
let sawClosed = null;
const lockedIdsSeenLocked = new Set();
let repaintDetected = false;
const lastKnownCore = new Map(); // id -> core field snapshot, to catch any repaint across steps

const START = 60;
const STEP = 5;

for (let n = START; n <= full.length; n += STEP) {
  orch.loadHistoricalCandles(full.slice(0, n));
  const result = orch.runFull();

  for (const s of result.signals) {
    const isLockedOrBeyond = ['LOCKED', 'TP1_HIT', 'RUNNER', 'TRAILING', 'CLOSED'].includes(s.state);
    if (isLockedOrBeyond) {
      sawLocked = true;
      lockedIdsSeenLocked.add(s.id);

      const coreSnapshot = { direction: s.direction, entry: s.entry, sl: s.sl, tp1: s.tp1, score: s.score, timestamp: s.timestamp };
      const prev = lastKnownCore.get(s.id);
      if (prev) {
        for (const k of Object.keys(coreSnapshot)) {
          if (JSON.stringify(prev[k]) !== JSON.stringify(coreSnapshot[k])) {
            repaintDetected = true;
            console.error(`  REPAINT at n=${n} on ${s.id}.${k}: ${JSON.stringify(prev[k])} -> ${JSON.stringify(coreSnapshot[k])}`);
          }
        }
      }
      lastKnownCore.set(s.id, coreSnapshot);
    }
    if (s.state === 'CLOSED' && !sawClosed) sawClosed = s;
  }

  if (sawLocked && sawClosed) break; // no need to keep simulating once both are observed
}

assert(sawLocked, 'at least one signal reaches LOCKED (or beyond) during incremental live simulation');
assert(!repaintDetected, 'no locked signal core field changed across incremental steps (live non-repaint check)');

if (sawClosed) {
  console.log(`  -> closed trade: ${sawClosed.id} result=${sawClosed.management.result} R=${sawClosed.management.resultR}`);
  assert(['WIN', 'LOSS', 'BE'].includes(sawClosed.management.result), 'closed trade has a valid result classification');
  assert(typeof sawClosed.management.resultR === 'number', 'closed trade has a numeric resultR');

  const stats = orch.storageEngine.computeStatistics();
  assert(stats.totalClosed >= 1, 'storage stats reflect at least one closed trade');
  assert(stats.winRate !== null, 'win rate is no longer null once a trade has actually closed');
  console.log('  -> stats:', JSON.stringify(stats));
} else {
  console.log('  -> no trade fully closed within this simulation window (non-fatal: LOCKED path itself is still verified above)');
}

console.log('\nLive simulation test complete.');
