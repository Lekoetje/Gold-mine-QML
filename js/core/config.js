// ============================================================================
// CONFIGURATION LAYER
// Every tunable parameter in the system lives here. Nothing below should be
// hard-coded elsewhere. Values marked "EXPERIMENTAL" are initial parameters
// that must eventually be validated through backtesting (see Section 31/59
// of the build spec) — they are NOT claimed to be statistically optimal.
// ============================================================================

export const CONFIG = {
  instrument: 'XAUUSD',

  timeframes: {
    primary: 'M15',        // main signal timeframe
    refinement: 'M5',      // optional lower-TF confirmation
    htf: ['D1', 'H4', 'H1'] // higher-timeframe alignment stack, checked top-down
  },

  swing: {
    sensitivity: 3,        // bars on each side required to confirm a pivot (higher = fewer, cleaner swings)
    minLegSizeATRMult: 0.5 // ignore swings smaller than this * ATR (filters noise)
  },

  qml: {
    zoneWidthATRMult: 0.35,   // QML zone half-width = ATR * this multiplier
    freshnessBonus: {         // EXPERIMENTAL — Section 59
      fresh: 10,
      oneTest: 5,
      twoTests: 0,
      manyTests: -10
    },
    expirationCandles: 60,    // QML goes STALE if untouched within this many candles of the primary TF
    maxTestsBeforeStale: 4
  },

  liquiditySweep: {
    minWickPenetrationATRMult: 0.15,
    rejectionMaxCandles: 3     // must show rejection within N candles of the sweep
  },

  bos: {
    useCloseConfirmation: true // prefer candle CLOSE over wick for structure breaks
  },

  displacement: {
    minBodyATRMult: 0.8,       // a candle body >= this * ATR counts as "large"
    minConsecutiveDirectional: 2
  },

  riskModel: {
    slBufferATRMult: 0.25,     // adaptive SL buffer beyond structural point
    minRR: 1.0,
    preferredRR: 2.0,
    defaultRiskPercent: 1.0,
    contractSize: 100,         // ozt per standard lot — CONFIGURE to match your broker
    minLotSize: 0.01,          // broker's minimum tradable lot size
    maxLotSize: 1.0,           // broker's maximum tradable lot size (per position)
    lotStep: 0.01,             // lot increment the broker allows
    maxDailyRiskPercent: 3.0,
    maxTradesPerDay: 5,
    maxSimultaneousSetups: 2
  },

  scoring: {
    weights: { // EXPERIMENTAL — Section 31. Sums to 100.
      qmStructure: 25,
      qmlQuality: 15,
      liquiditySweep: 10,
      bosDisplacement: 10,
      ftb: 10,
      htfAlignment: 10,
      divergence: 5,
      confluence: 5,     // supply/demand + FVG combined
      volatility: 5,
      session: 2.5,
      fundamentals: 2.5
    },
    thresholds: { // Section 32
      wait: 0,
      weak: 50,
      watch: 65,
      quality: 75,
      highQuality: 85,
      exceptional: 95
    },
    confirmationThreshold: 75 // minimum score AND mandatory structural conditions
  },

  volatility: {
    atrPeriod: 14,
    bands: { low: 0.6, normal: 1.4, high: 2.2 } // multiples of the ATR's own rolling median -> LOW/NORMAL/HIGH/EXTREME
  },

  sessions: {
    // UTC hour ranges — adjust for DST as needed
    asia: [0, 8],
    london: [7, 16],
    newYork: [12, 21]
  },

  news: {
    highImpactBlockMinutesBefore: 15, // optional filter; OFF by default per spec (news doesn't auto-cancel QM)
    highImpactBlockMinutesAfter: 15,
    filterEnabled: false
  },

  divergence: {
    oscillator: 'RSI',
    rsiPeriod: 14,
    bonus: { valid: 5, strong: 8 }
  },

  dataMode: 'DEMO', // 'DEMO' | 'LIVE' — flips automatically once a live provider is wired in (Section 68/69)

  storage: {
    localStorageKey: 'goldmine_qm_signals_v1',
    maxStoredSignals: 2000
  }
};
