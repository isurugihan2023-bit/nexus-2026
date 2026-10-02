/* ninjanexus.duckdns.org — paste into js/site.js (or equivalent).
 * Same-origin API via the nginx /api/ proxy above, so no CORS or hard-coded
 * bot IP is needed in the browser. Shows a clean "Bot offline" card when the
 * bot/panel is unreachable instead of zeros or empty boxes. No secrets here. */
const NEXUS_CONFIG = {
  API_BASE: '/api',           // proxied by nginx to http://157.90.181.183:23063
  STATS_ENDPOINT: '/api/public_stats',
  MOST_PLAYED_ENDPOINT: '/api/public/most-played?period=week',
  HEALTH_ENDPOINT: '/api/health',
  REFRESH_MS: 30000,
};

function nexusOfflineCard(el, detail) {
  el.innerHTML = ''
    + '<div class="nexus-offline">'
    + '<span class="nexus-offline-dot"></span>'
    + '<strong>Bot offline</strong>'
    + '<span>Live stats are unavailable right now — please check back soon.</span>'
    + (detail ? '<small>' + String(detail) + '</small>' : '')
    + '</div>';
}

async function nexusFetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function loadNexusStats(el) {
  try {
    const stats = await nexusFetchJson(NEXUS_CONFIG.STATS_ENDPOINT);
    // Render only when the payload has real numbers; never render zeros
    // from a failed/empty response.
    if (!stats || typeof stats.total_users === 'undefined') throw new Error('bad payload');
    el.dataset.online = 'true';
    return stats;
  } catch (e) {
    el.dataset.online = 'false';
    nexusOfflineCard(el);
    return null;
  }
}
