// ============================================================================
// NEWS / FUNDAMENTAL ENGINE (Sections 26, 27, 28, 29)
// Consumes an economic-calendar feed (live provider or demo data — see
// data/demoNews.js) and classifies proximity/impact. News does NOT
// automatically cancel a QM setup; it's surfaced as risk context, with an
// optional hard filter the user can enable.
// ============================================================================

export class NewsEngine {
  constructor(config) {
    this.config = config.news;
    this.events = []; // { title, timestamp, country, importance: 'LOW'|'MEDIUM'|'HIGH', forecast, previous, actual }
  }

  loadEvents(events) {
    this.events = events.slice().sort((a, b) => a.timestamp - b.timestamp);
  }

  nextEvent(nowMs, minImportance = 'MEDIUM') {
    const order = { LOW: 0, MEDIUM: 1, HIGH: 2 };
    return this.events.find(e => e.timestamp > nowMs && order[e.importance] >= order[minImportance]) || null;
  }

  /** Risk classification for a given moment (Section 26/27). */
  riskAt(nowMs) {
    const upcoming = this.events.filter(e => {
      const diffMin = (e.timestamp - nowMs) / 60000;
      return diffMin >= -this.config.highImpactBlockMinutesAfter && diffMin <= this.config.highImpactBlockMinutesBefore;
    });
    const high = upcoming.find(e => e.importance === 'HIGH');
    if (high) return { level: 'HIGH', event: high };
    const medium = upcoming.find(e => e.importance === 'MEDIUM');
    if (medium) return { level: 'MEDIUM', event: medium };
    return { level: 'LOW', event: null };
  }

  /** Whether the optional hard filter should block a NEW confirmation right now. */
  shouldBlockConfirmation(nowMs) {
    if (!this.config.filterEnabled) return false;
    return this.riskAt(nowMs).level === 'HIGH';
  }

  formatCountdown(nowMs, event) {
    if (!event) return null;
    const diffMs = event.timestamp - nowMs;
    if (diffMs <= 0) return 'now';
    const h = Math.floor(diffMs / 3_600_000);
    const m = Math.floor((diffMs % 3_600_000) / 60_000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  /** Gold-directional bias classification (Section 29) — contextual only. */
  goldBias(dxyTrend) {
    // dxyTrend: 'UP' | 'DOWN' | 'FLAT' — dollar strength is broadly inverse to gold
    if (dxyTrend === 'DOWN') return 'Gold Supportive';
    if (dxyTrend === 'UP') return 'Gold Negative';
    return 'Mixed';
  }
}
