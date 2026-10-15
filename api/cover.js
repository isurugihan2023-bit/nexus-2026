import { getBotBaseUrl } from './_bot_registry.js';
import crypto from 'crypto';

// GET /api/cover?slug=<game_key> — same-origin auto-cover proxy for cards.
// Flat function (no bracket filename): fetches
// getBotBaseUrl() + "/api/public/cover/" + slug (bot-captured Rich Presence
// JPEG) with an 8s timeout and returns the bytes with the upstream
// content-type. Same getBotBaseUrl() helper the other api/ routes use, so
// the browser never dials the bot directly (no mixed content, no IP leak).
// - Success: Cache-Control public, s-maxage=86400,
//   stale-while-revalidate=604800 (covers change rarely).
// - Upstream 404 / placeholder bytes / unreachable bot / any error: HTTP 404
//   with Cache-Control: no-store (never cached), so the frontend <img>
//   onerror chain continues to the next cover step and a later real cover
//   can arrive via retry. The terminal fallback is the local
//   /images/games/placeholder.jpg rendered by the frontend. No bot address
//   ever appears in responses.

const TIMEOUT_MS = 8000;
// images/games/placeholder.jpg and images/games/default.jpg are
// byte-identical (5707 bytes). An upstream 200 with identical bytes is not a
// real cover and is treated as a miss (404 below) so cards never stick on it.
const PLACEHOLDER_LEN = 5707;
const PLACEHOLDER_SHA256 = '46b261c800cc611b3b4ddd4e05226c1d2bb9bef51eb35529f604b6625278d423';

function sendCoverMiss(res) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).end();
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).end();
    }

    const raw = req.query?.slug;
    const slug = String(Array.isArray(raw) ? raw[0] : raw || '').trim();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
        return res.status(400).end();
    }

    const base = await getBotBaseUrl();
    if (!base) {
        return sendCoverMiss(res);
    }

    const url = `${base}/api/public/cover/${slug}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let upstream;
        try {
            upstream = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'image/*' },
            });
        } finally {
            clearTimeout(timeoutId);
        }
        if (!upstream.ok) {
            return sendCoverMiss(res);
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (buf.length === 0) {
            return sendCoverMiss(res);
        }
        if (buf.length === PLACEHOLDER_LEN) {
            const hex = crypto.createHash('sha256').update(buf).digest('hex');
            if (hex === PLACEHOLDER_SHA256) {
                return sendCoverMiss(res);
            }
        }
        res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'image/jpeg'
        );
        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );
        res.setHeader('Content-Length', String(buf.length));
        return res.status(200).send(buf);
    } catch (e) {
        console.log(`[cover] ${slug} failed: ${e.message}`);
        if (!res.headersSent) {
            return sendCoverMiss(res);
        }
        try {
            res.destroy();
        } catch {
            // Response already streaming: nothing safe left to do.
        }
        return undefined;
    }
}
