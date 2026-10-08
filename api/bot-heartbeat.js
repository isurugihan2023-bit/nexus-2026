// POST /api/bot-heartbeat — signed auto-discovery heartbeat receiver.
//
// The bot (backend/heartbeat.py, stdlib-only, ~1 POST/30s) sends:
//   { baseUrl, ip, port, version, startedAt, timestamp, nonce, status }
// signed with HMAC-SHA256 over "<timestamp>.<nonce>.<baseUrl>" using
// HEARTBEAT_SECRET, hex digest in the x-bot-signature header.
//
// Verifies: method, signature (timing-safe), timestamp skew <= 60s,
// nonce replay (per-instance + timestamp window), per-IP rate limit.
// Stores the record in Upstash for 7 days when configured; resolver freshness
// remains 90s (see _bot_registry.js).
// Unsigned/invalid requests get 401/400 with no storage write.

import crypto from 'crypto';
import { saveBotRecord, nonceSeen, rateLimited } from './_bot_registry.js';

const SKEW_MS = 60000;

function clientIp(req) {
    const fwd = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return fwd || req.socket?.remoteAddress || '?';
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', (c) => {
            raw += c;
            if (raw.length > 8192) reject(new Error('body too large'));
        });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
    });
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-bot-signature, x-heartbeat-signature');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

    // Rate limit: heartbeats are ~2/min; 30/min/IP blocks brute force.
    if (rateLimited(clientIp(req), 30, 60000)) {
        return res.status(429).json({ error: 'rate_limited' });
    }

    const secret = process.env.HEARTBEAT_SECRET || '';
    if (!secret) {
        console.log('[bot-heartbeat] HEARTBEAT_SECRET not configured');
        return res.status(500).json({ error: 'receiver not configured' });
    }

    let body;
    try {
        const raw = await readBody(req);
        body = JSON.parse(raw || '{}');
    } catch {
        return res.status(400).json({ error: 'bad json' });
    }

    const { baseUrl, ip, port, version, startedAt, timestamp, nonce, status } = body || {};
    if (!baseUrl || !timestamp || !nonce) {
        return res.status(400).json({ error: 'missing baseUrl/timestamp/nonce' });
    }
    // Only allow http(s) dial addresses; never store exotic schemes.
    if (!/^https?:\/\/[^/]+(:\d+)?$/.test(String(baseUrl))) {
        return res.status(400).json({ error: 'bad baseUrl' });
    }

    // Timestamp skew: reject older than 60s (and >30s in the future).
    const now = Date.now();
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || now - ts > SKEW_MS || ts - now > 30000) {
        return res.status(401).json({ error: 'stale timestamp' });
    }

    // Replay: reject a reused nonce within the window.
    if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 128) {
        return res.status(400).json({ error: 'bad nonce' });
    }
    if (nonceSeen(nonce)) {
        return res.status(401).json({ error: 'replayed nonce' });
    }

    // HMAC-SHA256 over "<timestamp>.<nonce>.<baseUrl>", timing-safe compare.
    const sig = req.headers['x-bot-signature'] || req.headers['x-heartbeat-signature'] || '';
    const msg = `${ts}.${nonce}.${baseUrl}`;
    const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
    const a = Buffer.from(String(sig).toLowerCase());
    const b = Buffer.from(expected.toLowerCase());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ error: 'bad signature' });
    }

    const record = await saveBotRecord({
        baseUrl: String(baseUrl),
        ip: String(ip || ''),
        port: Number(port) || null,
        version: String(version || ''),
        startedAt: Number(startedAt) || null,
        status: status === 'shutting-down' ? 'shutting-down' : 'online',
    });
    console.log(`[bot-heartbeat] learned ${record.baseUrl} (${record.status})`);
    return res.status(200).json({ ok: true, online: record.status !== 'shutting-down' });
}
