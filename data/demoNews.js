// ============================================================================
// DEMO NEWS/CALENDAR DATA (Section 68) — synthetic economic events used only
// when no live economic-calendar provider is configured.
// ============================================================================

export function generateDemoNews(nowMs = Date.now()) {
  const H = 3_600_000;
  return [
    { title: 'US CPI (YoY)', timestamp: nowMs + 1.4 * H, country: 'USD', importance: 'HIGH', forecast: '3.1%', previous: '3.0%', actual: null },
    { title: 'FOMC Member Speech', timestamp: nowMs + 5 * H, country: 'USD', importance: 'MEDIUM', forecast: null, previous: null, actual: null },
    { title: 'Non-Farm Payrolls', timestamp: nowMs + 26 * H, country: 'USD', importance: 'HIGH', forecast: '180K', previous: '175K', actual: null },
    { title: 'Retail Sales m/m', timestamp: nowMs + 30 * H, country: 'USD', importance: 'MEDIUM', forecast: '0.3%', previous: '0.2%', actual: null },
    { title: 'Unemployment Claims', timestamp: nowMs + 50 * H, country: 'USD', importance: 'LOW', forecast: '220K', previous: '215K', actual: null }
  ];
}
