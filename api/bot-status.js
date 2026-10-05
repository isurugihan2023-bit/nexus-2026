// GET /api/bot-status — public liveness probe for operators + UX.
//
// Returns { online, baseUrl, lastSeen, stale, version }.
//   * online: true when a heartbeat arrived within ~90s.
//   * baseUrl: current bot dial address (server-to-server discovery for the
//     dashboard/TS hosts). BROWSERS MUST NOT dial it directly: the bot is
//     plain HTTP while the site is HTTPS (mixed content) and the IP must not
//     leak into client code. Browser traffic uses same-origin proxy routes.
//   * Frontend "Bot Offline" state: poll this endpoint (same-origin, cheap,
//     cacheable for seconds) and render the offline card when online=false
//     instead of spinners or hanging requests.
import { getBotStatus, rateLimited } from './_bot_registry.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    // Short CDN cache: fresh enough for UX, cheap under polling.
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress || '?');
    if (rateLimited(`status:${ip}`, 120, 60000)) {
        return res.status(429).json({ error: 'rate_limited' });
    }

    const status = await getBotStatus();
    return res.status(200).json(status);
}
