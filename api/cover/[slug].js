import { getBotBaseUrl } from '../_bot_registry.js';

// GET /api/cover/:slug — same-origin auto-cover proxy for game cards.
// Fetches getBotBaseUrl() + "/api/public/cover/" + slug (bot-captured
// Rich Presence JPEG) with a 3s timeout and forwards the bytes.
// - Cache-Control: public, max-age=86400, s-maxage=86400 (covers are
//   content-addressed per game and change rarely).
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
    if (
        !slug ||
        slug.length > 128 ||
        slug.includes('/') ||
        slug.includes('\\') ||
        slug.includes('..') ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)
    ) {
        return res.status(400).end();
    }

    const base = await getBotBaseUrl();
    if (!base) {
        return res.status(404).end();
    }

    const url = `${base}/api/public/cover/${encodeURIComponent(slug)}`;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const upstream = await fetch(url, {
            signal: controller.signal,
            headers: { Accept: 'image/*' },
        });
        clearTimeout(timeoutId);
        if (upstream.status === 404) {
            return res.status(404).end();
        }
        if (!upstream.ok) {
            console.log(`[cover] ${slug} upstream HTTP ${upstream.status}`);
            return res.status(404).end();
        }
        const buf = Buffer.from(await upstream.arrayBuffer());
        if (!buf.length) {
            return res.status(404).end();
        }
        res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'image/jpeg'
        );
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        return res.status(200).send(buf);
    } catch (e) {
        console.log(`[cover] ${slug} failed: ${e.message}`);
        return res.status(404).end();
    }
}
