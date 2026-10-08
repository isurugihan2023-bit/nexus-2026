// Shared bot-address registry + resolver (Vercel: `api/_*.js` is never routed).
//
// Single source of truth for "where is the bot right now?".
// The bot POSTs a signed heartbeat every 30s to /api/bot-heartbeat; we store
// the latest { baseUrl, ip, port, version, startedAt, lastSeen } with a
// 7-day Redis retention, while a heartbeat is considered fresh for 90s.
// EVERY server-side caller uses getBotBaseUrl()/fetchBot() below
// so a moved bot is learned within 30-60s with ZERO manual updates.
//
// Storage: Upstash Redis REST when UPSTASH_REDIS_REST_URL+TOKEN (or legacy
// KV_REST_API_URL+TOKEN) are set — required for correct multi-instance
// Vercel production. Otherwise an in-memory Map (dev / single instance;
// warm instances share it, cold instances fall back to env/offline).
// Tell-tale: [registry] logs "redis" or "memory" on first use.
//
// Fallback order in getBotBaseUrl():
//   1. fresh heartbeat (age <= 90s)
//   2. last known address within the stale grace period (<= 24h, marked stale)
//   3. optional env fallback BOT_FALLBACK_URL (or legacy BOT_UPSTREAM, first entry)
//   4. null  -> callers must render a clean "Bot Offline" state.
//
// Browser traffic must NEVER dial the bot directly (plain HTTP bot vs HTTPS
// site = mixed content + IP leak). All browser traffic goes through these
// same-origin server routes, which dial the bot server-side with a 3s timeout.

import crypto from 'crypto';

// Keep heartbeat freshness separate from address retention; a stale address
// is not reported online unless a heartbeat is fresh.
const HEARTBEAT_TTL_MS = 90000;
// A stale address remains dialable during a temporary heartbeat outage.
const ADDRESS_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_MS = 24 * 60 * 60 * 1000;
// Resolver caches the answer 30s so we don't hit Redis on every request.
const CACHE_MS = 30000;
// Replay-nonce memory (per instance; Redis-backed deployments also rely on
// the 60s timestamp window, which bounds replay value to ~nil).
const NONCE_TTL_MS = 5 * 60 * 1000;

const KEY = 'nexus:bot:record';

// ---- in-memory fallback ----
const mem = {
    record: null, // { baseUrl, ip, port, version, startedAt, lastSeen }
    baseCache: { value: undefined, at: 0 },
    nonces: new Map(), // nonce -> expiresAt
    rate: new Map(), // ip -> [timestamps]
    loggedBackend: false,
};
let registryStorage = 'memory';

function redisCfg() {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
    if (url && token) return { url: url.replace(/\/$/, ''), token };
    return null;
}

function logBackendOnce() {
    if (mem.loggedBackend) return;
    mem.loggedBackend = true;
    console.log(`[registry] storage=${redisCfg() ? 'redis' : 'memory (set UPSTASH_REDIS_REST_URL/TOKEN for prod)'}`);
}

// Minimal Redis REST pipeline: GET / SET(EX) / DEL via POST /pipeline.
async function redisPipeline(cmds) {
    const cfg = redisCfg();
    if (!cfg) return null;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2500);
    try {
        const res = await fetch(`${cfg.url}/pipeline`, {
            method: 'POST',
            signal: controller.signal,
            headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(cmds),
        });
        if (!res.ok) throw new Error(`redis HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(t);
    }
}

export async function saveBotRecord(rec) {
    logBackendOnce();
    const record = { ...rec, lastSeen: Date.now() };
    const raw = JSON.stringify(record);
    const cfg = redisCfg();
    if (cfg) {
        try {
            // Retain the last signed address through temporary heartbeat outages.
            await redisPipeline([[ 'SET', KEY, raw, 'PX', String(ADDRESS_RECORD_TTL_MS) ]]);
            registryStorage = 'upstash';
        } catch (e) {
            console.log(`[registry] redis save failed, keeping memory copy: ${e.message}`);
            mem.record = record;
            registryStorage = 'memory_fallback';
        }
    } else {
        mem.record = record;
        registryStorage = 'memory';
    }
    // Invalidate the resolver cache so the new host is used immediately
    // (not after the 30s cache window).
    mem.baseCache = { value: undefined, at: 0 };
    return record;
}

export async function loadBotRecord() {
    logBackendOnce();
    const cfg = redisCfg();
    if (cfg) {
        try {
            const out = await redisPipeline([[ 'GET', KEY ]]);
            registryStorage = 'upstash';
            const val = out && out[0] && out[0].result;
            if (val) {
                const rec = typeof val === 'string' ? JSON.parse(val) : val;
                return rec;
            }
            return null;
        } catch (e) {
            console.log(`[registry] redis load failed, using memory copy: ${e.message}`);
            registryStorage = 'memory_fallback';
            return mem.record;
        }
    }
    registryStorage = 'memory';
    return mem.record;
}

// ---- nonce replay guard (per-instance best effort) ----
export function nonceSeen(nonce) {
    const now = Date.now();
    // Prune occasionally (keeps 512MiB-style hosts happy).
    if (mem.nonces.size > 5000) {
        for (const [k, exp] of mem.nonces) {
            if (exp < now) mem.nonces.delete(k);
            if (mem.nonces.size < 4000) break;
        }
    }
    if (mem.nonces.has(nonce) && mem.nonces.get(nonce) > now) return true;
    mem.nonces.set(nonce, now + NONCE_TTL_MS);
    return false;
}

// ---- tiny per-IP rate limiter (per instance) ----
export function rateLimited(ip, limit = 30, windowMs = 60000) {
    const now = Date.now();
    const key = ip || '?';
    let bucket = mem.rate.get(key) || [];
    bucket = bucket.filter((t) => now - t < windowMs);
    if (bucket.length >= limit) {
        mem.rate.set(key, bucket);
        return true;
    }
    bucket.push(now);
    mem.rate.set(key, bucket);
    return false;
}

function envFallback() {
    const single = (process.env.BOT_FALLBACK_URL || '').trim();
    if (single) return single.replace(/\/$/, '');
    const legacy = (process.env.BOT_UPSTREAM || '')
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean);
    if (legacy.length > 0) return legacy[0];
    return null;
}

export function getBotFallbackUrl() {
    return envFallback();
}

// Resolve the current bot base URL (or null when offline).
// Returns { url, stale, ageMs, source } — callers treat stale/last-known per policy.
export async function resolveBot() {
    const now = Date.now();
    if (mem.baseCache.at && now - mem.baseCache.at < CACHE_MS && mem.baseCache.value !== undefined) {
        return mem.baseCache.value;
    }
    const rec = await loadBotRecord();
    let out;
    if (rec && rec.baseUrl) {
        const age = now - (rec.lastSeen || 0);
        if (age <= HEARTBEAT_TTL_MS) {
            out = { url: rec.baseUrl, stale: false, ageMs: age, source: 'heartbeat', record: rec };
        } else if (age <= GRACE_MS) {
            console.log(`[registry] serving stale last-known bot address (age ${Math.round(age / 1000)}s)`);
            out = { url: rec.baseUrl, stale: true, ageMs: age, source: 'heartbeat', record: rec };
        }
    }
    if (!out) {
        const fb = envFallback();
        if (fb) {
            console.log('[registry] no heartbeat; using env fallback');
            out = { url: fb, stale: true, ageMs: -1, source: 'fallback', record: null };
        } else {
            out = { url: null, stale: true, ageMs: -1, source: 'none', record: null };
        }
    }
    mem.baseCache = { value: out, at: now };
    return out;
}

// The key piece: one helper used by EVERY server route that talks to the bot.
export async function getBotBaseUrl() {
    const r = await resolveBot();
    return r.url;
}

export async function getBotStatus() {
    const rec = await loadBotRecord();
    const now = Date.now();
    const age = rec ? now - (rec.lastSeen || 0) : -1;
    const online = !!rec && age >= 0 && age <= HEARTBEAT_TTL_MS;
    const resolved = await resolveBot();
    // PUBLIC probe: deliberately NO baseUrl / ip — the dial address (bot IP)
    // must never leak to browsers. Server-side code resolves via
    // getBotBaseUrl()/fetchBot(); server-side operators that need the dial
    // address use the AUTHENTICATED GET /api/bot-status-full (HMAC over
    // "<timestamp>.<nonce>.bot-status-full" with HEARTBEAT_SECRET).
    return {
        online,
        lastSeen: rec?.lastSeen || null,
        stale: !online,
        version: rec?.version || null,
        resolved_source: resolved.source,
        heartbeat_age_seconds: age >= 0 ? Math.round(age / 1000) : null,
        registry_storage: registryStorage,
    };
}

// Full record for AUTHENTICATED callers only (see api/bot-status-full.js).
// Same shape as getBotStatus() plus the discovery fields (baseUrl/ip/port).
export async function getBotStatusFull() {
    const rec = await loadBotRecord();
    const now = Date.now();
    const age = rec ? now - (rec.lastSeen || 0) : -1;
    const online = !!rec && age >= 0 && age <= HEARTBEAT_TTL_MS;
    return {
        online,
        lastSeen: rec?.lastSeen || null,
        stale: !online,
        version: rec?.version || null,
        baseUrl: rec?.baseUrl || null,
        ip: rec?.ip || null,
        port: rec?.port || null,
        startedAt: rec?.startedAt || null,
        status: rec?.status || null,
    };
}

// Shared HMAC-SHA256 auth for server endpoints (api/bot-status-full.js).
// Canonical string: "<timestamp>.<nonce>.<context>" — the same scheme as
// the heartbeat (which uses the bot's baseUrl as context), timing-safe.
// Timestamp/nonce arrive in x-bot-timestamp / x-bot-nonce headers so they
// never leak into access logs or URLs. Returns { ok, ... } with an HTTP
// status + error code when rejected.
export function verifyBotSignature(req, context, { skewMs = 60000 } = {}) {
    const secret = process.env.HEARTBEAT_SECRET || '';
    if (!secret) {
        console.log('[registry] HEARTBEAT_SECRET not configured; rejecting authenticated request');
        return { ok: false, status: 500, error: 'receiver not configured' };
    }
    const ts = Number(req.headers['x-bot-timestamp']);
    const nonce = String(req.headers['x-bot-nonce'] || '');
    if (!Number.isFinite(ts)) {
        return { ok: false, status: 400, error: 'missing x-bot-timestamp' };
    }
    const now = Date.now();
    if (now - ts > skewMs || ts - now > 30000) {
        return { ok: false, status: 401, error: 'stale timestamp' };
    }
    if (nonce.length < 8 || nonce.length > 128) {
        return { ok: false, status: 400, error: 'bad nonce' };
    }
    if (nonceSeen(nonce)) {
        return { ok: false, status: 401, error: 'replayed nonce' };
    }
    const sig = req.headers['x-bot-signature'] || req.headers['x-heartbeat-signature'] || '';
    const msg = `${ts}.${nonce}.${context}`;
    const expected = crypto.createHmac('sha256', secret).update(msg).digest('hex');
    const a = Buffer.from(String(sig).toLowerCase());
    const b = Buffer.from(expected.toLowerCase());
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, status: 401, error: 'bad signature' };
    }
    return { ok: true, ts, nonce };
}

// GET/POST path on the bot with a short timeout. Returns { res, base, ms }
// or null when offline/unreachable. Never throws for network errors.
export async function fetchBot(path, { timeoutMs = 3000, method = 'GET', body, headers } = {}) {
    const { url: base } = await resolveBot();
    if (!base) {
        console.log('[registry] offline: no bot address known');
        return null;
    }
    const url = `${base}${path}`;
    const started = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            method,
            signal: controller.signal,
            headers: { Accept: 'application/json', ...(headers || {}) },
            body,
        });
        clearTimeout(timeoutId);
        return { res, base, ms: Date.now() - started };
    } catch (e) {
        console.log(`[registry] bot ${url} failed in ${Date.now() - started}ms: ${e.message}`);
        return null;
    }
}
