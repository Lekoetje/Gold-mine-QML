# Gold Mine — XAU/USD QM + QML Trading Analysis

A mobile-first, decision-support web app that analyzes XAU/USD price action for
Quasimodo (QM) reversal structures and QML reaction zones, scores setups
against a configurable rule set, and produces WAIT / DEVELOPING / BUY / SELL
states with locked, non-repainting signal history.

**This is an analysis tool, not a trading bot.** It does not place trades and
does not promise any win rate. The QM Alignment Score measures rule
*alignment*, not win probability.

---

## 1. Project structure

```
Gold-mine-QML/
├── index.html                  # app shell (mobile-first)
├── css/style.css                # design tokens + layout
├── js/
│   ├── core/
│   │   ├── config.js             # ALL tunable parameters live here
│   │   ├── resample.js           # lower-TF -> higher-TF candle aggregation (real HTF derivation)
│   │   └── orchestrator.js       # wires every engine, runs the candle-by-candle pipeline
│   ├── engines/
│   │   ├── candleEngine.js       # tick -> OHLC candles
│   │   ├── swingEngine.js        # confirmed pivot highs/lows
│   │   ├── marketStructureEngine.js  # HH/HL/LH/LL labeling + trend
│   │   ├── liquidityEngine.js    # sweep detection + grading
│   │   ├── qmqmlEngine.js        # QM detection + QML zone (the core)
│   │   ├── confirmationEngine.js # QML reaction, HTF alignment, RSI divergence
│   │   ├── supplyDemandEngine.js # basing-zone / origin-of-move detection
│   │   ├── fvgEngine.js          # fair value gap detection
│   │   ├── fibonacciEngine.js    # optional 50%/61.8% confluence check
│   │   ├── volatilityEngine.js   # ATR + LOW/NORMAL/HIGH/EXTREME
│   │   ├── sessionEngine.js      # Asia/London/New York context
│   │   ├── newsEngine.js         # economic calendar risk/countdown
│   │   ├── scoringEngine.js      # QM Alignment Score
│   │   ├── riskEngine.js         # SL/TP1/R:R/position sizing
│   │   ├── signalStateEngine.js  # state machine + LOCK/non-repaint guarantee
│   │   └── storageEngine.js      # persistence + backtest statistics
│   ├── ui/
│   │   ├── chart.js              # canvas candlestick chart
│   │   └── signalCards.js        # WAIT / DEVELOPING / LOCKED cards
│   └── main.js                   # app entry point
├── data/
│   ├── demoData.js               # synthetic candle generator (DEMO mode)
│   └── demoNews.js               # synthetic economic calendar (DEMO mode)
├── backend/
│   └── proxy-worker.example.js   # template for a live-data API proxy (not deployed)
├── .github/workflows/tests.yml   # CI: runs the test suite on every push
├── tests/
│   ├── smoke.test.mjs             # end-to-end pipeline test
│   ├── lockEngine.test.mjs        # focused non-repaint / immutability test
│   └── confluenceEngines.test.mjs # resampling, HTF derivation, S/D, FVG, Fibonacci
└── docs/                         # (reserved for future architecture notes)
```

Each engine is a standalone ES module with no framework dependency — every
one of them can be imported and unit-tested in isolation (`node tests/*.mjs`).

---

## 2. Technologies used

- **Vanilla HTML/CSS/JavaScript (ES modules), no build step.** Chosen
  specifically because you're developing from an Android phone: no bundler,
  no Node toolchain required to edit or preview, and it deploys directly to
  GitHub Pages by pushing static files.
- **Canvas 2D** for the chart — lighter than pulling in a full charting
  library, and gives full control over drawing exactly the layers the spec
  asks for (candles, HH/HL/LH/LL, QML zones, Entry/SL/TP1) without
  indicator clutter.
- **Fraunces** (serif, price/headline) + **IBM Plex Sans/Mono** (UI/data) —
  a deliberate pairing: the serif nods to gold's classic, tactile value; the
  mono gives terminal-grade precision to scores, levels, and timestamps.
- **No frontend framework.** Nothing in the spec needs React/Vue-level
  complexity, and skipping one keeps the whole thing editable from a phone's
  browser or a simple text editor.

---

## 3. Data providers used

**None are connected yet.** The app runs entirely on synthetic **DEMO DATA**
(see `data/demoData.js` / `data/demoNews.js`), clearly labeled in the UI
header (🟡 DEMO DATA). This was an explicit engineering decision, not an
oversight: Section 65 of the spec requires me to identify providers and ask
for credentials rather than hard-code a dependency or invent a live
connection that doesn't exist.

**Recommended providers to wire in when you're ready** (not yet integrated):

| Need | Candidates | Notes |
|---|---|---|
| Live XAU/USD price + candles | Twelve Data, Polygon.io, OANDA, Finnhub | Check WebSocket support, CORS, and free-tier rate limits before committing |
| Economic calendar | TradingEconomics API, Financial Modeling Prep, Finnhub calendar | Avoid scraping calendar sites directly — use a licensed API |
| Backend/API proxy | Cloudflare Workers, Vercel/Netlify Functions | Free tier, no server to manage — fits a phone-based workflow. Template at `backend/proxy-worker.example.js` |
| Storage | Start with `localStorage` (already implemented); move to Supabase/Cloudflare D1/Firebase when you need cross-device history | `storageEngine.js` already isolates this behind a small interface, so swapping the backend later doesn't touch the engines |

## 4. Required API keys

**None yet — nothing has been connected**, so there's nothing to supply
right now. When you pick providers from the table above, you'll need:

- A market-data API key (from whichever XAU/USD provider you choose)
- An economic-calendar API key (if you pick a dedicated calendar provider)

Both would be set as **secrets on the backend proxy** (e.g. `wrangler secret
put MARKET_DATA_API_KEY`), never committed to the repo and never placed in
frontend JavaScript (Section 67).

---

## 5. What is currently live

Nothing external. The full analysis pipeline — candle engine through swing
detection, market structure, liquidity sweeps, QM/QML detection, QML
reaction confirmation, HTF alignment scaffolding, RSI divergence, session
context, scoring, risk/R:R calculation, the signal state machine, and the
lock/non-repaint engine — runs completely client-side against whatever
candles are loaded (currently the demo generator).

## 6. What is demo/mock

- **Price data**: `data/demoData.js` generates a synthetic-but-structured
  OHLC series (sine-wave trend + noise + occasional volatility spikes) so
  real QM/QML patterns actually emerge for testing.
- **News/economic calendar**: `data/demoNews.js` — five fabricated upcoming
  events with plausible-but-fake countdowns.
- **HTF (D1/H4/H1) trend inputs**: now derived for real by resampling the
  primary M15 series into H1/H4/D1 candles and running the same
  MarketStructureEngine against each (`js/core/resample.js`,
  `orchestrator.computeHTFTrends()`) — no longer hardcoded.
- **Supply/Demand, FVG, and Fibonacci confluence**: now real detection
  engines (`supplyDemandEngine.js`, `fvgEngine.js`, `fibonacciEngine.js`),
  feeding the scoring engine's confluence weight instead of a flat
  placeholder.

---

## 7. How to run it

No build step. From the project folder:

```bash
python3 -m http.server 8080
# or: npx serve .
```

Then open `http://localhost:8080` (or your phone's local IP if serving from
a computer on the same network). Opening `index.html` directly via
`file://` also works in most mobile browsers since there's no server-side
code required for demo mode.

**Run the tests:**

```bash
node tests/smoke.test.mjs               # full pipeline, sanity checks
node tests/lockEngine.test.mjs          # non-repaint / immutability guarantee
node tests/confluenceEngines.test.mjs   # resampling, HTF, S/D, FVG, Fibonacci
```

These also run automatically on every push via GitHub Actions
(`.github/workflows/tests.yml`).

---

## 8. How to deploy to GitHub Pages

1. Push this repository to GitHub (main branch).
2. In the repo: **Settings → Pages → Source → Deploy from a branch → main
   → / (root)**.
3. GitHub will publish at `https://<username>.github.io/Gold-mine-QML/`.

No build step needed — Pages serves the static files as-is. If you later
add a backend proxy (Section 6/64), deploy it separately (e.g. Cloudflare
Workers) since GitHub Pages can only host static content.

---

## 9. Known limitations

- **No live market data or news feed connected** — everything currently
  runs on labeled demo data. This is the single biggest gap before this is
  a real trading-analysis tool.
- **Fibonacci, Supply/Demand, and FVG zones aren't drawn on the chart yet**
  — the detection engines are real and feed the score, but the optional
  visual layers from Section 5 aren't rendered in `chart.js` yet (kept out
  deliberately for now per Section 6's "don't overwhelm the chart" rule —
  would need a toggle rather than always-on).
- **MPL (Section 23) is not implemented** — the spec allows the core system
  to work without it, so it was deferred.
- **HTF resampling re-derives from scratch on every run** — fine at demo
  scale (3000 M15 candles), but for a live feed running continuously this
  should become incremental rather than a full re-resample each tick.
- **Backtest statistics are real but there's no closed-trade data to feed
  them** — `storageEngine.computeStatistics()` now computes win rate,
  profit factor, average R, max drawdown, and breakdowns by session/score
  band/volatility/divergence/sweep presence (Section 62), but everything
  reads `null`/`0` until the Trade Management layer actually closes trades
  with a realized R-multiple. Trade Management (partial close, runner,
  structural trailing per Section 17) itself isn't wired into the live
  pipeline yet — `signalStateEngine.js` has the methods
  (`markTP1Hit`/`trailStop`/`markClosed`), but nothing calls them
  automatically as price moves.
- **No authentication/multi-user support** — `localStorage` is per-browser;
  fine for a single user, not for a shared/team deployment.
- **CI runs the test suite but doesn't lint or check the UI files** —
  `chart.js`, `signalCards.js`, and `main.js` are syntax-checked manually,
  not covered by the Node-based test suite since they depend on DOM APIs.

---

## 10. What should be built next

1. Pick and wire in a live XAU/USD data provider (start with REST polling
   before WebSocket streaming — simpler to debug from a phone).
2. Deploy `backend/proxy-worker.example.js` (filled in for your chosen
   provider) so the frontend never touches a raw API key.
3. Wire an economic-calendar API into `NewsEngine.loadEvents()`.
4. Wire Trade Management into the live pipeline — call
   `markTP1Hit`/`trailStop`/`markClosed` automatically as price moves past
   TP1/SL, so `StorageEngine.computeStatistics()` has real closed-trade
   data to report on.
5. Add optional chart layers for the now-real S/D/FVG/Fibonacci zones,
   behind a toggle so the chart stays uncluttered by default (Section 6).
6. Move HTF resampling to incremental updates once running against a
   continuous live feed rather than a fixed historical batch.
7. Add a GitHub Pages deploy workflow alongside the existing test workflow
   (`.github/workflows/tests.yml`).
8. Only after 1–7 are solid and backtested with real closed-trade history:
   revisit whether machine learning adds anything (Section 63) — not
   before.
