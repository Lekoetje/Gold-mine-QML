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

const orchestrator = new Orchestrator(CONFIG);
const chart = new ChartRenderer(document.getElementById('chart-canvas'));
const cardsContainer = document.getElementById('signal-cards');

function boot() {
  const isDemo = CONFIG.dataMode === 'DEMO';
  document.getElementById('mode-dot').className = `status-dot ${isDemo ? 'demo' : 'live'}`;
  document.getElementById('mode-label').textContent = isDemo ? 'DEMO DATA' : 'LIVE';

  const candles = generateDemoCandles(400, 15 * 60_000, 2350);
  orchestrator.loadHistoricalCandles(candles);
  orchestrator.loadNews(generateDemoNews());

  refresh();
  document.getElementById('refresh-btn').addEventListener('click', refresh);
}

function refresh() {
  // Synthetic HTF context for the demo — in LIVE mode this comes from real D1/H4/H1 structure
  const htfTrends = { D1: 'NEUTRAL', H4: 'NEUTRAL', H1: 'NEUTRAL' };
  const result = orchestrator.runFull(htfTrends);

  updateHeader(result);
  updateMetaRow(result);

  const lockedSignal = (result.activeSignals || []).find(s => s.state === 'LOCKED');
  chart.render({
    candles: result.candles,
    swings: result.swings,
    qmCandidates: result.qmCandidates,
    lockedSignal
  });

  renderSignalCards(cardsContainer, result);
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
  el.innerHTML = `
    <span class="tag">Session: ${sessionLabel}</span>
    <span class="tag">Volatility: ${result.volatilityClass}</span>
    <span class="tag">News Risk: ${newsRisk}</span>
    <span class="tag">Structure: ${result.trend}</span>
  `;
}

boot();
