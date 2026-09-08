// ============================================================================
// SESSION ENGINE (Section 24)
// Purely contextual — never creates a QM by itself. Provides a subtle bonus
// around London/New York opens and their overlap.
// ============================================================================

export class SessionEngine {
  constructor(config) {
    this.sessions = config.sessions;
  }

  classify(timestampMs) {
    const hour = new Date(timestampMs).getUTCHours();
    const active = [];
    for (const [name, [start, end]] of Object.entries(this.sessions)) {
      if (hour >= start && hour < end) active.push(name);
    }
    return active.length ? active : ['off_hours'];
  }

  contextBonus(timestampMs) {
    const active = this.classify(timestampMs);
    if (active.includes('london') && active.includes('newYork')) return 1.0; // overlap, full bonus
    const hour = new Date(timestampMs).getUTCHours();
    const nearLondonOpen = Math.abs(hour - this.sessions.london[0]) <= 1;
    const nearNYOpen = Math.abs(hour - this.sessions.newYork[0]) <= 1;
    if (nearLondonOpen || nearNYOpen) return 0.6;
    if (active.includes('off_hours')) return 0;
    return 0.3;
  }
}
