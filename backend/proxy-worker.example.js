// ============================================================================
// SECURE BACKEND / API PROXY — TEMPLATE (Sections 64–67)
//
// This is a template, not wired into the app yet. Its job when you add a
// live data provider: keep API keys server-side, normalize provider
// responses into the shape the frontend expects, and expose clean endpoints
// so the frontend NEVER holds a credential.
//
// Deploy target: a free-tier serverless platform (Cloudflare Workers is a
// good fit for a GitHub Pages + phone-based workflow — no server to manage).
// Rename to proxy-worker.js, fill in your provider, set the API key as a
// platform secret (never commit it), and deploy separately from the
// GitHub Pages frontend. Point js/core/liveFeed.js (create this file when
// you're ready) at this worker's URL.
// ============================================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/candles') {
      const timeframe = url.searchParams.get('tf') || 'M15';
      const provider = 'REPLACE_WITH_PROVIDER'; // e.g. twelvedata, polygon, oanda
      const apiKey = env.MARKET_DATA_API_KEY; // set via `wrangler secret put MARKET_DATA_API_KEY`

      // Example shape only — replace with your provider's actual endpoint/params.
      const upstream = await fetch(`https://REPLACE_WITH_PROVIDER_HOST/candles?symbol=XAUUSD&interval=${timeframe}&apikey=${apiKey}`);
      const data = await upstream.json();

      // Normalize to the CandleEngine's expected shape before returning.
      const normalized = (data.values || []).map(v => ({
        bucketStart: new Date(v.datetime).getTime(),
        open: parseFloat(v.open), high: parseFloat(v.high),
        low: parseFloat(v.low), close: parseFloat(v.close),
        volume: parseInt(v.volume || 0, 10)
      }));

      return json(normalized);
    }

    if (url.pathname === '/api/news') {
      const apiKey = env.CALENDAR_API_KEY;
      // Wire to a real economic-calendar provider here.
      return json([]);
    }

    return new Response('Not found', { status: 404 });
  }
};

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
