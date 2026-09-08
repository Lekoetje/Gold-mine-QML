// ============================================================================
// SIGNAL CARDS (Sections 46–49)
// ============================================================================

export function renderSignalCards(container, result) {
  container.innerHTML = '';

  const active = (result.activeSignals || []).filter(s => s.state !== 'DEVELOPING' || s.score >= 40);
  const locked = active.filter(s => ['LOCKED', 'TP1_HIT', 'RUNNER', 'TRAILING'].includes(s.state));
  const developing = active.filter(s => ['DEVELOPING', 'ARMED'].includes(s.state));

  if (locked.length === 0 && developing.length === 0) {
    container.appendChild(waitCard(result));
    return;
  }

  for (const s of locked) container.appendChild(lockedCard(s));
  for (const s of developing.slice(0, 3)) container.appendChild(developingCard(s));
}

function waitCard(result) {
  const el = document.createElement('div');
  el.className = 'signal-card wait-card';
  const news = result.nextNewsEvent
    ? `${result.nextNewsEvent.title} — ${formatCountdown(result.nextNewsEvent.timestamp)}`
    : 'None scheduled';
  el.innerHTML = `
    <div class="top-row">
      <span class="signal-direction wait">WAIT</span>
      <span class="state-pill">SCANNING</span>
    </div>
    <p>No high-quality QM setup right now.</p>
    <p>Structure: ${result.trend || 'UNKNOWN'} &nbsp;·&nbsp; Volatility: ${result.volatilityClass}</p>
    <p>Next major event: ${news}</p>
  `;
  return el;
}

function developingCard(s) {
  const el = document.createElement('div');
  el.className = 'signal-card';
  const dir = s.direction === 'bearish' ? 'SELL' : 'BUY';
  el.innerHTML = `
    <div class="top-row">
      <span class="signal-direction ${dir === 'BUY' ? 'buy' : 'sell'}">DEVELOPING ${dir}</span>
      <span class="state-pill developing">${s.state}</span>
    </div>
    <div class="checklist">${checklist(s)}</div>
    <div class="score-row">
      <span class="score-value">${s.score.toFixed(0)}/100</span>
      <span class="score-class">WAITING FOR QML REACTION / CONFIRMATION</span>
    </div>
  `;
  return el;
}

function lockedCard(s) {
  const el = document.createElement('div');
  el.className = 'signal-card';
  const dir = s.direction === 'bearish' ? 'SELL' : 'BUY';
  el.innerHTML = `
    <div class="top-row">
      <span class="signal-direction ${dir === 'BUY' ? 'buy' : 'sell'}">${dir}</span>
      <span class="state-pill locked">🔒 ${s.state}</span>
    </div>
    <div class="checklist">${checklist(s)}</div>
    <div class="levels-grid">
      <div class="level"><div class="label">Entry</div><div class="value">${s.entry.toFixed(2)}</div></div>
      <div class="level"><div class="label">SL</div><div class="value">${s.sl.toFixed(2)}</div></div>
      <div class="level"><div class="label">TP1</div><div class="value">${s.tp1.toFixed(2)}</div></div>
    </div>
    <div class="score-row">
      <span class="score-value">R:R 1:${s.rr.toFixed(2)} &nbsp;·&nbsp; ${s.score.toFixed(0)}/100</span>
      <span class="score-class">${s.reasons ? s.reasons.join(' + ') : ''}</span>
    </div>
  `;
  return el;
}

function checklist(s) {
  const items = s.reasons || [];
  const all = ['QM', 'Liquidity Sweep', 'BOS', 'FTB', 'HTF Alignment', 'Divergence'];
  return all.map(label => {
    const done = items.some(r => r.startsWith(label));
    return `<span class="${done ? 'done' : ''}">${done ? '✓' : '·'} ${label}</span>`;
  }).join('');
}

function formatCountdown(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'now';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
