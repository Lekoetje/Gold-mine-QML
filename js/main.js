// ============================================================================
// APP ENTRY POINT
// Boots in DEMO mode by default (Section 68) — clearly labeled in the UI.
// Swap `dataMode: 'LIVE'` in config.js and wire a real feed in
// js/core/liveFeed.js (see README) once you have provider credentials.
// ============================================================================

import { CONFIG } from './core/config.js';
import { Orchestrator } from './core/orchestrator.js';
import { generateDemoCandles } from '../data/demoData.js';
import { generateDemoNews } from '../data/demoNews.js';
import { ChartRenderer } from './ui/chart.js';
import { renderSignalCards } from './ui/signalCards.js';
import { renderStatsPanel } from './ui/statsPanel.js';

const orchestrator = new Orchestrator(CONFIG);
const chart = new ChartRenderer(document.getElementById('chart-canvas'));
const cardsContainer = document.getElementById('signal-cards');
const statsContainer = document.getElementById('stats-panel');

function boot() {
  const isDemo = CONFIG.dataMode === 'DEMO';
  document.getElementById('mode-dot').className = `status-dot ${isDemo ? 'demo' : 'live'}`;
  document.getElementById('mode-label').textContent = isDemo ? 'DEMO DATA' : 'LIVE';

  // 3000 M15 candles (~31 days) gives enough history for D1/H4/H1 resampling
  // to produce real HTF trends rather than falling back to NEUTRAL.
  const candles = generateDemoCandles(3000, 15 * 60_000, 2350);
  orchestrator.loadHistoricalCandles(candles);
  orchestrator.loadNews(generateDemoNews());

  refresh();
  document.getElementById('refresh-btn').addEventListener('click', refresh);
}

function refresh() {
  // HTF (D1/H4/H1) trends are now derived for real by resampling the primary
  // candle series inside the orchestrator — no manual input needed.
  const result = orchestrator.runFull();

  updateHeader(result);
  updateMetaRow(result);

  const lockedSignal = (result.activeSignals || []).find(s => s.state === 'LOCKED');
  chart.render({
    candles: result.candles,
    swings: result.swings,
    qmCandidates: result.qmCandidates,
    sdZones: result.sdZones,
    fvgZones: result.fvgZones,
    lockedSignal
  });

  renderSignalCards(cardsContainer, result);
  renderStatsPanel(statsContainer, orchestrator.storageEngine.computeStatistics());
}

function updateHeader(result) {
  const last = result.candles[result.candles.length - 1];
  const prev = result.candles[result.candles.length - 2];
  if (!last) return;
  const priceEl = document.getElementById('price');
  priceEl.textContent = last.close.toFixed(2);
  priceEl.className = 'price ' + (prev && last.close >= prev.close ? 'up' : 'down');
}

function updateMetaRow(result) {
  const el = document.getElementById('meta-row');
  const sessionLabel = (result.session || []).join(' + ');
  const newsRisk = result.newsRisk?.level || 'LOW';
  const htf = result.htfTrends || {};
  el.innerHTML = `
    <span class="tag">Session: ${sessionLabel}</span>
    <span class="tag">Volatility: ${result.volatilityClass}</span>
    <span class="tag">News Risk: ${newsRisk}</span>
    <span class="tag">M15: ${result.trend}</span>
    <span class="tag">H1: ${htf.H1 || '—'}</span>
    <span class="tag">H4: ${htf.H4 || '—'}</span>
    <span class="tag">D1: ${htf.D1 || '—'}</span>
  `;
}

boot();
