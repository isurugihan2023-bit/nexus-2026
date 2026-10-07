import { fetchUpstream } from '../_nexus.js';

// GET /api/cover/:slug — same-origin auto-cover proxy for game cards.
// Same pattern as api/spotify.js: resolve the bot via getBotBaseUrl()
// (inside fetchUpstream) and proxy server-side with a 3s timeout, so the
// browser never dials the bot directly (no mixed content, no IP leak).
// Fetches "/api/public/cover/" + slug (bot-captured Rich Presence JPEG)
// and forwards the bytes with Content-Type image/jpeg and
// Cache-Control public, max-age=86400, s-maxage=86400.
// - Bot 404 (not captured yet) passes through as 404 so the card's
//   onerror chain falls back to the game fallback cover.
// - Bot offline / any upstream error also becomes a bare 404 (never 502,
//   never JSON) so <img> keeps working. No bot address ever appears in
//   responses (status, headers or body).

const TIMEOUT_MS = 3000;

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
    if (!/^[a-z0-9-]+$/.test(slug) || slug.length > 128) {
        return res.status(400).end();
    }

    const hit = await fetchUpstream(
        `/api/public/cover/${encodeURIComponent(slug)}`,
        TIMEOUT_MS,
        'cover'
    );
    if (!hit) {
        return res.status(404).end();
    }
    try {
        if (hit.res.status === 404) {
            return res.status(404).end();
        }
        if (!hit.res.ok) {
            console.log(`[cover] ${slug} upstream HTTP ${hit.res.status}`);
            return res.status(404).end();
        }
        const buf = Buffer.from(await hit.res.arrayBuffer());
        if (!buf.length) {
            return res.status(404).end();
        }
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        return res.status(200).send(buf);
    } catch (e) {
        console.log(`[cover] ${slug} failed: ${e.message}`);
        return res.status(404).end();
    }
}
