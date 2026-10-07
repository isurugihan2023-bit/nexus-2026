import { getBotBaseUrl } from './_bot_registry.js';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

// GET /api/cover?slug=<game_key> — same-origin auto-cover proxy for cards.
// Flat function (no bracket filename): fetches
// getBotBaseUrl() + "/api/public/cover/" + slug (bot-captured Rich Presence
// JPEG) with an 8s timeout and streams the bytes back with the upstream
// content-type. Same getBotBaseUrl() helper the other api/ routes use, so
// the browser never dials the bot directly (no mixed content, no IP leak).
// - Success: Cache-Control public, s-maxage=86400,
//   stale-while-revalidate=604800 (covers change rarely).
// - Upstream 404 / unreachable bot / any error: 302 to the local generic
//   fallback (/images/games/placeholder.jpg) — never a 404/500 page, so
//   <img> tags always resolve. No bot address ever appears in responses.

const TIMEOUT_MS = 8000;
const FALLBACK_PATH = '/images/games/placeholder.jpg';

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
        return res.redirect(302, FALLBACK_PATH);
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
        if (!upstream.ok || !upstream.body) {
            return res.redirect(302, FALLBACK_PATH);
        }
        res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'image/jpeg'
        );
        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );
        await pipeline(Readable.fromWeb(upstream.body), res);
        return undefined;
    } catch (e) {
        console.log(`[cover] ${slug} failed: ${e.message}`);
        if (!res.headersSent) {
            return res.redirect(302, FALLBACK_PATH);
        }
        try {
            res.destroy();
        } catch {
            // Response already streaming: nothing safe left to do.
        }
        return undefined;
    }
}
