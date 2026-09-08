// ============================================================================
// HISTORICAL STORAGE (Sections 61–62)
// Browser-local persistence for now (localStorage). Swappable for a real
// database via Connector 4 (Section 65) once a backend exists — the
// interface (save/getAll/clear) stays the same either way.
// ============================================================================

export class StorageEngine {
  constructor(config) {
    this.key = config.storage.localStorageKey;
    this.max = config.storage.maxStoredSignals;
  }

  save(signal) {
    const all = this.getAll();
    const idx = all.findIndex(s => s.id === signal.id);
    if (idx >= 0) all[idx] = signal; else all.push(signal);
    const trimmed = all.slice(-this.max);
    try {
      localStorage.setItem(this.key, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('StorageEngine: persist failed', e);
    }
  }

  getAll() {
    try {
      const raw = localStorage.getItem(this.key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  clear() {
    try { localStorage.removeItem(this.key); } catch (e) { /* noop */ }
  }

  /** Rough Section 62 stats — expands as more closed trades accumulate. */
  computeStatistics() {
    const closed = this.getAll().filter(s => s.management?.result);
    const wins = closed.filter(s => s.management.result === 'WIN').length;
    const losses = closed.filter(s => s.management.result === 'LOSS').length;
    const total = closed.length;
    return {
      totalSetups: this.getAll().length,
      totalClosed: total,
      wins,
      losses,
      winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : null
    };
  }
}
