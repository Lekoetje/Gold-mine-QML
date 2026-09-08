// ============================================================================
// RISK ENGINE TEST — position sizing against broker lot constraints
// Run with: node tests/riskEngine.test.mjs
// ============================================================================

import { RiskEngine } from '../js/engines/riskEngine.js';
import { CONFIG } from '../js/core/config.js';

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1; } else { console.log('PASS:', msg); }
}

const risk = new RiskEngine(CONFIG);

// Config sanity
assert(CONFIG.riskModel.minLotSize === 0.01, 'min lot size configured as 0.01');
assert(CONFIG.riskModel.maxLotSize === 1.0, 'max lot size configured as 1.0');

// --- Case 1: comfortably mid-range position, no clamping needed ---
// $10,000 balance, 1% risk = $100 risk. Entry 2400, SL 2390 -> $10/oz risk.
// ounces = 100/10 = 10oz -> lots = 10/100 = 0.1 lot (within 0.01-1.0 range)
let r = risk.positionSize(10000, 1, 2400, 2390);
assert(r.lots === 0.1, `mid-range position sizes correctly: got ${r.lots} lots (expected 0.1)`);
assert(!r.clamped, 'mid-range position is not clamped');
assert(!r.belowMinLot, 'mid-range position is not below min lot');

// --- Case 2: tiny account/risk -> below min lot, gets clamped up ---
// $100 balance, 0.5% risk = $0.50 risk / $10 per oz = 0.05oz -> 0.0005 lot, below 0.01 min
r = risk.positionSize(100, 0.5, 2400, 2390);
assert(r.lots === CONFIG.riskModel.minLotSize, `tiny risk clamps up to min lot: got ${r.lots}`);
assert(r.belowMinLot === true, 'tiny risk is correctly flagged as belowMinLot');
assert(r.actualRiskAmount > r.riskAmount, 'actual risk at min lot exceeds the requested risk amount when clamped up');

// --- Case 3: huge account/risk -> above max lot, gets clamped down ---
// $5,000,000 balance, 5% risk = $250,000 risk / $10 per oz = 25,000oz -> 250 lots, way above max 1.0
r = risk.positionSize(5_000_000, 5, 2400, 2390);
assert(r.lots === CONFIG.riskModel.maxLotSize, `huge risk clamps down to max lot: got ${r.lots}`);
assert(r.clamped === true, 'huge risk is correctly flagged as clamped');
assert(r.actualRiskAmount < r.riskAmount, 'actual risk at max lot is less than the requested (huge) risk amount when clamped down');

// --- Case 4: lot step rounding ---
// Craft a risk amount that lands between steps and confirm it rounds to the nearest 0.01
r = risk.positionSize(10000, 1.23, 2400, 2390); // arbitrary odd risk % to force a non-round raw lot size
const remainder = Math.round((r.lots / CONFIG.riskModel.lotStep)) * CONFIG.riskModel.lotStep;
assert(Math.abs(r.lots - remainder) < 1e-9, `lot size respects the configured lot step: got ${r.lots}`);

// --- Case 5: zero risk distance doesn't divide by zero ---
r = risk.positionSize(10000, 1, 2400, 2400);
assert(r.lots === 0, 'zero SL distance returns 0 lots rather than throwing/Infinity');

console.log('\nRisk engine test complete.');
