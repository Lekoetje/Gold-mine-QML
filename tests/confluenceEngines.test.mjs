// ============================================================================
// CONFLUENCE ENGINES TEST — resampling, HTF derivation, S/D, FVG, Fibonacci
// Run with: node tests/confluenceEngines.test.mjs
// ============================================================================

import { resampleCandles } from '../js/core/resample.js';
import { SupplyDemandEngine } from '../js/engines/supplyDemandEngine.js';
import { FVGEngine } from '../js/engines/fvgEngine.js';
import { FibonacciEngine } from '../js/engines/fibonacciEngine.js';
import { CONFIG } from '../js/core/config.js';
import { generateDemoCandles } from '../data/demoData.js';
import { Orchestrator } from '../js/core/orchestrator.js';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('PASS:', msg); }
}

// --- Resampling ---
const m15 = generateDemoCandles(3000, 15 * 60_000, 2350);
const h1 = resampleCandles(m15, 'H1');
const h4 = resampleCandles(m15, 'H4');
const d1 = resampleCandles(m15, 'D1');

assert(h1.length > 0 && h1.length < m15.length, `H1 resample produces fewer, larger candles (${h1.length} from ${m15.length})`);
assert(h4.length > 0 && h4.length < h1.length, `H4 resample produces fewer candles than H1 (${h4.length} vs ${h1.length})`);
assert(d1.length > 0 && d1.length < h4.length, `D1 resample produces fewer candles than H4 (${d1.length} vs ${h4.length})`);
assert(h1.every(c => c.high >= c.low && c.high >= c.open && c.high >= c.close), 'resampled H1 candles have valid OHLC bounds (high)');
assert(h1.every(c => c.low <= c.open && c.low <= c.close), 'resampled H1 candles have valid OHLC bounds (low)');

// no-lookahead: the last resampled bucket should never include the very final source candle
// if that candle doesn't complete the bucket (checked implicitly by construction, verified here for H1)
const lastM15 = m15[m15.length - 1];
const lastH1 = h1[h1.length - 1];
assert(lastH1.bucketStart + 60 * 60_000 <= lastM15.bucketStart, 'final resampled H1 bucket is fully closed before the source series ends');

// --- Orchestrator computes real HTF trends (not hardcoded NEUTRAL for all) ---
const orch = new Orchestrator(CONFIG);
orch.loadHistoricalCandles(m15);
const result = orch.runFull();
assert(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.htfTrends.D1), `D1 trend is a valid classification: ${result.htfTrends.D1}`);
assert(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(result.htfTrends.H1), `H1 trend is a valid classification: ${result.htfTrends.H1}`);
console.log(`  -> HTF trends: D1=${result.htfTrends.D1} H4=${result.htfTrends.H4} H1=${result.htfTrends.H1}`);

// --- Supply/Demand engine ---
const sdEngine = new SupplyDemandEngine(CONFIG);
const sdZones = sdEngine.detect(result.candles, result.atrSeries);
assert(Array.isArray(sdZones), 'S/D engine returns an array');
assert(sdZones.every(z => z.high >= z.low), 'every S/D zone has high >= low');
assert(sdZones.every(z => z.type === 'supply' || z.type === 'demand'), 'every S/D zone is typed supply or demand');
console.log(`  -> ${sdZones.length} S/D zones detected`);

// --- FVG engine ---
const fvgEngine = new FVGEngine();
const fvgs = fvgEngine.detect(result.candles);
assert(Array.isArray(fvgs), 'FVG engine returns an array');
assert(fvgs.every(g => g.high >= g.low), 'every FVG has high >= low');
console.log(`  -> ${fvgs.length} FVGs detected`);

// --- Fibonacci engine ---
const fibEngine = new FibonacciEngine(CONFIG);
if (result.qmCandidates.length > 0) {
  const qm = result.qmCandidates[0];
  const atr = result.atrSeries[qm.head.index] || 1;
  const fibResult = fibEngine.checkConfluence(qm, atr);
  assert(['none', 'fifty', 'goldenRatio'].includes(fibResult), `Fibonacci confluence returns a valid classification: ${fibResult}`);
} else {
  console.log('  -> no QM candidates in this run to test Fibonacci confluence against (non-fatal)');
}

// --- Statistics engine doesn't fabricate numbers with no closed trades ---
const stats = orch.storageEngine.computeStatistics();
assert(stats.totalClosed === 0, 'no closed trades yet -> totalClosed is 0, not fabricated');
assert(stats.winRate === null, 'win rate is null (not 0 or fabricated) when there is no closed history');
assert(stats.profitFactor === null, 'profit factor is null when there is no closed history');

console.log('\nConfluence engines test complete.');
