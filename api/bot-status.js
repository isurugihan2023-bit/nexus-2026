// GET /api/bot-status — public liveness probe for operators + UX.
//
// Returns { online, lastSeen, stale, version } ONLY — no baseUrl: the bot
// dial address (IP) must not leak into client code. Server-side code
// resolves via getBotBaseUrl()/fetchBot() in _bot_registry.js; server-side
// operators that need the dial address use the AUTHENTICATED
// /api/bot-status-full (HMAC-signed header, HEARTBEAT_SECRET).
//   * online: true when a heartbeat arrived within ~90s.
//   * Frontend "Bot Offline" state: poll this endpoint (same-origin, cheap,
//     cacheable for seconds) and render the offline card when online=false
//     instead of spinners or hanging requests.
import { getBotStatus, rateLimited } from './_bot_registry.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        // Resolver diagnostics must reflect this function's current registry state.
        res.setHeader('Cache-Control', 'no-store');

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
