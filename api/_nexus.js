// Shared website-proxy helpers (Vercel: `api/_*.js` is never routed).
//
// - Bot host is dynamic (signed heartbeats). Optional env fallback via
//   BOT_FALLBACK_URL (legacy BOT_UPSTREAM first entry still honoured).
// - 2.5s per-upstream timeout; a host that times out/refuses is
//   short-circuited for 30s so one dead upstream can't serialize delay.
// - Local-first cover resolution: bot-provided absolute image URLs are
//   NEVER trusted (the old same-origin /static/* URLs hang for 20s+ and
//   http:// URLs are blocked as mixed content on the HTTPS page).

import { getBotFallbackUrl, resolveBot } from './_bot_registry.js';

// Dynamic bot address: learned from signed heartbeats (see _bot_registry.js
// + /api/bot-heartbeat). No hardcoded IP here — getBotBaseUrl() returns the
// fresh heartbeat (<=90s), then a short stale grace, then the optional
// BOT_FALLBACK_URL env, then null (offline).
const DOWN_MS = 30000;
const FAILS_TO_MARK_DOWN = 2; // never poison on a single slow/cold response
const downUntil = new Map(); // best-effort per-instance short-circuit
const consecFails = new Map();

export async function upstreamBases() {
    const resolved = await resolveBot();
    const fallback = getBotFallbackUrl();
    return [...new Set([resolved.url, fallback].filter(Boolean))];
}

export function isDown(base) {
    return (downUntil.get(base) || 0) > Date.now();
}

const failuresByTag = new Map();

export function getUpstreamFailure(tag) {
    return failuresByTag.get(tag) || { reason: 'upstream_unreachable' };
}

function markDown(base) {
    const fails = (consecFails.get(base) || 0) + 1;
    consecFails.set(base, fails);
    // A single slow/cold timeout must NOT poison the host: only
    // short-circuit after consecutive network failures. An actually
    // dead host still trips after the 2nd consecutive failure.
    if (fails >= FAILS_TO_MARK_DOWN) {
        downUntil.set(base, Date.now() + DOWN_MS);
    }
}

function markUp(base) {
    downUntil.delete(base);
    consecFails.delete(base);
}

// GET path from the dynamically-resolved bot. Returns { res, base, ms }
// or null when offline/skipped. Short 2.5-3s timeout so a dead host never
// causes long hangs (4s delays / 20s image hangs of the past). Network
// errors and aborts count toward the consecutive-failure short-circuit
// (2+ in a row); HTTP statuses reset it and do not mark down.
export async function fetchUpstream(path, timeoutMs = 2500, tag = 'proxy', options = {}) {
    const { retries = 0, retryDelayMs = 1000, maxDurationMs, retryStatuses = [] } = options;
    const retryStatusSet = new Set(retryStatuses);
    const bases = await upstreamBases();
    const startedOverall = Date.now();
    const deadline = startedOverall + (maxDurationMs
        ?? timeoutMs * (retries + 1) + retryDelayMs * retries);
    let triedBase = false;
    failuresByTag.set(tag, {
        reason: bases.length ? 'upstream_unreachable' : 'no_address'
    });
    for (const base of bases) {
        if (isDown(base)) {
            console.log(`[${tag}] skip known-down origin`);
            continue;
        }
        triedBase = true;
        const url = `${base}${path}`;
        let failed = false;
        for (let attempt = 0; attempt <= retries; attempt += 1) {
            const remaining = deadline - Date.now();
            if (remaining <= 0) break;
            const started = Date.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), Math.min(timeoutMs, remaining));
            try {
                const res = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' }
                });
                clearTimeout(timeoutId);
                if (attempt < retries && retryStatusSet.has(res.status)
                        && deadline - Date.now() > retryDelayMs) {
                    await res.body?.cancel().catch(() => {});
                    console.log(`[${tag}] retrying upstream HTTP ${res.status}`);
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                    continue;
                }
                markUp(base);
                failuresByTag.delete(tag);
                console.log(`[${tag}] upstream responded HTTP ${res.status} in ${Date.now() - started}ms`);
                return { res, base, ms: Date.now() - started };
            } catch (e) {
                clearTimeout(timeoutId);
                failed = true;
                console.log(`[${tag}] upstream failed in ${Date.now() - started}ms: ${e.message}`);
                if (attempt < retries && deadline - Date.now() > retryDelayMs) {
                    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
                } else {
                    break;
                }
            }
        }
        if (failed) markDown(base);
    }
    if (!triedBase) failuresByTag.set(tag, { reason: bases.length ? 'circuit_open' : 'no_address' });
    return null;
}

export function slugOf(name) {
    return String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

const ROBOT_FALLBACK = 'images/games/fallback.svg';

// Category label (bot `category`, or the game name) -> shipped local art.
// NOTE: category art (cat-*.svg) is NO LONGER used as a card cover - the
// shared images/games/default.jpg is the cover fallback instead. The
// genre label on cards still comes from the category text. This helper
// stays for reference; localCover below is the cover authority.
const CATEGORY_ART = [
    [/fivem|roleplay|gta|ceylon/i, 'images/games/cat-fivem.svg'],
    [/tactical|fps|shooter|cod|call of duty|overwatch/i, 'images/games/cat-tactical-fps.svg'],
    [/battle royale|battlegrounds|pubg|fortnite|warzone|apex/i, 'images/games/cat-battle-royale.svg'],
    [/platform|fighter|brawl/i, 'images/games/cat-platform.svg'],
    [/rac|f1|formula|forza|driving/i, 'images/games/cat-racing.svg'],
    [/moba|strategy|dota|league of legends/i, 'images/games/cat-moba.svg'],
    [/action|wuther|wukong|rpg|adventure|genshin/i, 'images/games/cat-action-rpg.svg'],
    [/sandbox|survival|craft|rust|minecraft|roblox/i, 'images/games/cat-sandbox.svg'],
    [/sport|football|fifa|rocket league/i, 'images/games/cat-sports.svg']
];

export function categoryArt(category, name) {
    const hay = `${category || ''} ${name || ''}`;
    for (const [re, art] of CATEGORY_ART) {
        if (re.test(hay)) return art;
    }
    return ROBOT_FALLBACK;
}

// Shipped manual covers (images/games/<key>.jpg) and bot-captured auto
// covers (images/games/auto/<key>.jpg), from `git ls-files images/games`.
// Keys outside these sets have no local file — emit the shared default
// placeholder directly so the browser never requests a missing URL (no 404).
const KNOWN_MANUAL_COVERS = new Set([
    'antigravity', 'bluestacks-5', 'brawlhalla', 'ceylon-roleplay', 'code',
    'default', 'dota-2', 'f1-25', 'fivem', 'mirror-s-edge-catalyst',
    'placeholder', 'pubg-battlegrounds', 'valorant', 'visual-studio-code',
    'vscode', 'wallpaper-engine'
]);
const KNOWN_AUTO_COVERS = new Set([
    'bluestacks-5', 'ceylon-roleplay', 'fivem', 'freebuff', 'valorant'
]);

// Local-first cover for one game. `image` is a relative website path
// (a per-game images/games/<game_key>.jpg drop-in when present, otherwise
// the shared default placeholder directly — never a missing URL). `auto`
// is the bot-captured Rich Presence art (images/games/auto/<game_key>.jpg
// when captured, otherwise the same placeholder). Absolute bot URLs are
// deliberately discarded — never http://, never a hanging /static/* URL.
export function localCover(game) {
    const g = game || {};
    const key = slugOf(g.game_key || g.name || g.game_name) || 'game';
    const fallback = `images/games/default.jpg?v=2`;
    return {
        image: KNOWN_MANUAL_COVERS.has(key) ? `images/games/${key}.jpg?v=2` : fallback,
        auto: KNOWN_AUTO_COVERS.has(key) ? `images/games/auto/${key}.jpg?v=2` : fallback,
        fallback,
        robot: ROBOT_FALLBACK
    };
}

// Rewrite one proxied game row to the local-first cover shape.
// `auto` rides along so the frontend can insert the captured-art step
// (manual -> auto -> category -> robot) without extra requests.
export function sanitizeGameRow(g, i) {
    const name = g.name || g.game_name || 'Game';
    const cover = localCover({ game_key: g.game_key, name, category: g.category });
    return {
        rank: g.rank ?? i + 1,
        game_key: g.game_key || slugOf(name),
        name,
        category: g.category || 'Other',
        image: cover.image,
        auto: cover.auto,
        auto_image: cover.auto,
        fallback: cover.fallback,
        rich_cover: null,
        unique_players: g.unique_players ?? 0,
        total_hours: g.total_hours ?? 0,
        sessions: g.sessions ?? 0,
        top_players: Array.isArray(g.top_players) ? g.top_players.slice(0, 4) : []
    };
}
