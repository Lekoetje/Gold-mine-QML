// ============================================================================
// STATS PANEL (Section 62)
// Renders whatever StorageEngine.computeStatistics() actually has. Shows an
// honest empty state rather than fabricating numbers when there's no closed
// trade history yet.
// ============================================================================

export function renderStatsPanel(container, stats) {
  if (!stats || stats.totalClosed === 0) {
    container.innerHTML = `<p class="stats-empty">No closed trades yet — statistics will appear here once locked signals run their course (TP1 / stop / trailing close).</p>`;
    return;
  }

  const pf = stats.profitFactor === null ? '—' : (stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2));

  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat"><div class="stat-label">Closed</div><div class="stat-value">${stats.totalClosed}</div></div>
      <div class="stat"><div class="stat-label">Win Rate</div><div class="stat-value">${stats.winRate}%</div></div>
      <div class="stat"><div class="stat-label">Avg R</div><div class="stat-value">${stats.averageR ?? '—'}</div></div>
      <div class="stat"><div class="stat-label">Profit Factor</div><div class="stat-value">${pf}</div></div>
      <div class="stat"><div class="stat-label">Max Drawdown</div><div class="stat-value">${stats.maxDrawdownR ?? '—'}R</div></div>
      <div class="stat"><div class="stat-label">Total Setups</div><div class="stat-value">${stats.totalSetups}</div></div>
    </div>
    ${breakdownTable('By Score Band', stats.byScoreBand)}
    ${breakdownTable('By Session', stats.bySessionR)}
    ${breakdownTable('By Volatility', stats.byVolatility)}
    ${breakdownTable('Divergence Present', stats.withDivergence)}
    ${breakdownTable('Liquidity Sweep Present', stats.withLiquiditySweep)}
  `;
}

function breakdownTable(title, groups) {
  const keys = Object.keys(groups || {});
  if (keys.length === 0) return '';
  const rows = keys.map(k => {
    const g = groups[k];
    return `<div class="breakdown-row"><span>${k}</span><span>${g.wins}W/${g.losses}L · ${g.winRate}%</span></div>`;
  }).join('');
  return `<div class="breakdown-block"><div class="breakdown-title">${title}</div>${rows}</div>`;
}
