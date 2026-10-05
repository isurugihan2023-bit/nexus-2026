// GET /api/bot-status-full — AUTHENTICATED full bot record (incl. baseUrl).
//
// Companion to the PUBLIC /api/bot-status, which returns only
// { online, lastSeen, stale, version } — the dial address (bot IP) must
// never be served to browsers. This route hands the discovery fields
// (baseUrl/ip/port/startedAt/status) to server-side operators that hold
// HEARTBEAT_SECRET: pull_auto_covers.py and the dashboard/TS hosts.
//
// Auth (mirrors the heartbeat scheme): HMAC-SHA256 over the canonical
// string "<timestamp>.<nonce>.bot-status-full", hex digest in the
// x-bot-signature header, with x-bot-timestamp / x-bot-nonce headers.
// Timestamp skew <= 60s, nonce replay guard, per-IP rate limit,
// timing-safe compare. Unsigned/invalid requests get 401/400, no data.
import { getBotStatusFull, rateLimited, verifyBotSignature } from './_bot_registry.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
        'Content-Type, x-bot-signature, x-heartbeat-signature, x-bot-timestamp, x-bot-nonce');
    // Never cache an IP-bearing response.
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });

    const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()
        || req.socket?.remoteAddress || '?');
    // 30/min/IP: plenty for operators, useless for brute force.
    if (rateLimited(`statusfull:${ip}`, 30, 60000)) {
        return res.status(429).json({ error: 'rate_limited' });
    }

    const v = verifyBotSignature(req, 'bot-status-full');
    if (!v.ok) {
        return res.status(v.status).json({ error: v.error });
    }

    const status = await getBotStatusFull();
    return res.status(200).json(status);
}
