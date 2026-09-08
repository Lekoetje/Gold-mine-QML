// ============================================================================
// HISTORICAL STORAGE (Sections 61–62)
// Browser-local persistence via localStorage where available, falling back
// to an in-memory Map otherwise (Node/test environments, or any context
// where localStorage is unavailable/blocked). Swappable for a real database
// via Connector 4 (Section 65) once a backend exists — the interface
// (save/getAll/clear) stays the same either way.
// ============================================================================

const hasLocalStorage = typeof localStorage !== 'undefined';

export class StorageEngine {
  constructor(config) {
    this.key = config.storage.localStorageKey;
    this.max = config.storage.maxStoredSignals;
    this._memoryStore = hasLocalStorage ? null : new Map(); // id -> signal, used when localStorage is unavailable
  }

  save(signal) {
    if (hasLocalStorage) {
      const all = this.getAll();
      const idx = all.findIndex(s => s.id === signal.id);
      if (idx >= 0) all[idx] = signal; else all.push(signal);
      const trimmed = all.slice(-this.max);
      try {
        localStorage.setItem(this.key, JSON.stringify(trimmed));
      } catch (e) {
        console.warn('StorageEngine: persist failed', e);
      }
      return;
    }
    this._memoryStore.set(signal.id, signal);
    if (this._memoryStore.size > this.max) {
      const oldestKey = this._memoryStore.keys().next().value;
      this._memoryStore.delete(oldestKey);
    }
  }

  getAll() {
    if (hasLocalStorage) {
      try {
        const raw = localStorage.getItem(this.key);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }
    return Array.from(this._memoryStore.values());
  }

  clear() {
    if (hasLocalStorage) {
      try { localStorage.removeItem(this.key); } catch (e) { /* noop */ }
      return;
    }
    this._memoryStore.clear();
  }

  /**
   * Backtest statistics (Section 62). `resultR` on a closed signal — the
   * realized result expressed in R-multiples (e.g. +2.1R, -1R) — is what
   * lets profit factor / average R / drawdown be computed; the trade
   * management layer should populate it on close. Until enough real closed
   * trades exist this will legitimately show null/zero rather than
   * fabricated numbers (Section 62: "do NOT manufacture statistics").
   */
  computeStatistics() {
    const all = this.getAll();
    const closed = all.filter(s => s.management?.result);
    const wins = closed.filter(s => s.management.result === 'WIN');
    const losses = closed.filter(s => s.management.result === 'LOSS');
    const total = closed.length;

    const rValues = closed.map(s => s.management.resultR).filter(v => typeof v === 'number');
    const grossWinR = rValues.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const grossLossR = Math.abs(rValues.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const profitFactor = grossLossR > 0 ? Math.round((grossWinR / grossLossR) * 100) / 100 : (grossWinR > 0 ? Infinity : null);
    const averageR = rValues.length > 0 ? Math.round((rValues.reduce((a, b) => a + b, 0) / rValues.length) * 100) / 100 : null;

    const maxDrawdownR = this._computeMaxDrawdown(closed);

    return {
      totalSetups: all.length,
      totalClosed: total,
      wins: wins.length,
      losses: losses.length,
      winRate: total > 0 ? Math.round((wins.length / total) * 1000) / 10 : null,
      profitFactor,
      averageR,
      maxDrawdownR,
      bySessionR: this._breakdownBy(closed, s => s.session || 'unknown'),
      byScoreBand: this._breakdownBy(closed, s => this._scoreBand(s.score)),
      byVolatility: this._breakdownBy(closed, s => s.volatilityAtEntry || 'unknown'),
      withDivergence: this._breakdownBy(closed, s => (s.reasons || []).some(r => r.startsWith('Divergence')) ? 'with_divergence' : 'without_divergence'),
      withLiquiditySweep: this._breakdownBy(closed, s => (s.reasons || []).includes('Liquidity Sweep') ? 'with_sweep' : 'without_sweep')
    };
  }

  _computeMaxDrawdown(closedSorted) {
    const sorted = [...closedSorted].sort((a, b) => (a.management.closedAt || 0) - (b.management.closedAt || 0));
    let equity = 0, peak = 0, maxDD = 0;
    for (const s of sorted) {
      const r = typeof s.management.resultR === 'number' ? s.management.resultR : 0;
      equity += r;
      peak = Math.max(peak, equity);
      maxDD = Math.min(maxDD, equity - peak);
    }
    return sorted.length > 0 ? Math.round(maxDD * 100) / 100 : null;
  }

  _scoreBand(score) {
    if (score == null) return 'unknown';
    if (score >= 95) return 'exceptional';
    if (score >= 85) return 'high_quality';
    if (score >= 75) return 'quality';
    if (score >= 65) return 'watch';
    if (score >= 50) return 'weak';
    return 'wait';
  }

  _breakdownBy(closed, keyFn) {
    const groups = {};
    for (const s of closed) {
      const key = keyFn(s);
      if (!groups[key]) groups[key] = { total: 0, wins: 0, losses: 0 };
      groups[key].total += 1;
      if (s.management.result === 'WIN') groups[key].wins += 1;
      if (s.management.result === 'LOSS') groups[key].losses += 1;
    }
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      g.winRate = g.total > 0 ? Math.round((g.wins / g.total) * 1000) / 10 : null;
    }
    return groups;
  }
}
