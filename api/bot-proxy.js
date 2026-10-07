// /api/bot-proxy — dynamic dashboard/asset proxy (replaces static vercel.json rewrites).
//
// Legacy public paths (/members, /dashboard, /admin*, /servers, /static/*)
// are rewritten here by vercel.json WITHOUT any hardcoded bot IP:
//   { "source": "/members", "destination": "/api/bot-proxy?path=/members" }
// This function resolves the CURRENT bot host via getBotBaseUrl() on every
// request (30s cache) and proxies GET/POST server-side with a 3s timeout.
//
// Why: vercel.json destinations are static at deploy time and can never
// follow a moved bot. This proxy is dynamic, keeps the bot's plain-HTTP
// address off the browser (no mixed content, no IP leak), and returns a
// clean "Bot Offline" page instead of hanging when the bot is down.
import { getBotBaseUrl } from './_bot_registry.js';

const TIMEOUT_MS = 3000;

const SITE_ORIGIN = 'https://ninjanexus.duckdns.org';
// Local dev origins: GET-only, and only for public read-only bot paths.
const LOCAL_ORIGINS = new Set(['http://127.0.0.1:5500', 'http://localhost:5500']);

// Only bot paths that serve public, read-only data may be read cross-origin
// from a localhost dev server. Everything else (dashboard / admin / members /
// servers, and any write) is same-origin-site only.
function isLocalhostReadable(target) {
    return target.startsWith('/static/');
}

function applyCors(req, res, target) {
    const origin = req.headers.origin || '';
    res.setHeader('Vary', 'Origin');
    if (origin === SITE_ORIGIN) {
        res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        return;
    }
    const readOnly = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (readOnly && LOCAL_ORIGINS.has(origin) && isLocalhostReadable(target)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    // else: no ACAO header — the browser blocks the cross-origin read.
}

function readRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => {
            chunks.push(c);
            if (Buffer.concat(chunks).length > 2 * 1024 * 1024) reject(new Error('body too large'));
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function offlinePage() {
    return `<!doctype html><meta charset="utf-8"><title>Bot Offline</title>`
        + `<body style="font-family:system-ui;background:#0b0b0f;color:#e5e5e5;display:grid;place-items:center;min-height:100vh;margin:0">`
        + `<div style="text-align:center"><h1>Bot Offline</h1>`
        + `<p>Live dashboard is unavailable right now — please check back soon.</p></div></body>`;
}

export default async function handler(req, res) {
    const sub = req.query?.path || '/';
    const target = String(Array.isArray(sub) ? sub[0] : sub);
    if (!target.startsWith('/') || target.includes('..')) {
        return res.status(400).send('bad path');
    }

    applyCors(req, res, target);

    if (req.method === 'OPTIONS') return res.status(204).end();

    const base = await getBotBaseUrl();
    if (!base) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(503).send(offlinePage());
    }

    const qs = req.url.includes('?')
        ? '&' + req.url.split('?')[1].split('&').filter((p) => !p.startsWith('path=')).join('&')
        : '';
    const url = `${base}${target}${qs === '&' ? '' : qs.replace(/^&/, '?')}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        const headers = { Accept: '*/*' };
        const ct = req.headers['content-type'];
        if (ct) headers['Content-Type'] = ct;
        const auth = req.headers['authorization'];
        if (auth) headers['Authorization'] = auth;

        let body;
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            body = await readRawBody(req);
        }
        const upstream = await fetch(url, {
            method: req.method,
            signal: controller.signal,
            headers,
            body: body && body.length ? body : undefined,
        });
        clearTimeout(timeoutId);

        res.status(upstream.status);
        const uCT = upstream.headers.get('content-type');
        if (uCT) res.setHeader('Content-Type', uCT);
        const buf = Buffer.from(await upstream.arrayBuffer());
        return res.send(buf);
    } catch (e) {
        console.log(`[bot-proxy] ${target} via ${base} failed: ${e.message}`);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(503).send(offlinePage());
    }
}
