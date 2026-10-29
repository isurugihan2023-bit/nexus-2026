import { fetchUpstream, getUpstreamFailure } from './_nexus.js';

const NON_GAME_CATEGORIES = new Set([
    'application', 'utility', 'development', 'other', 'app', 'spotify', 'custom status', 'status', 'music'
]);
const NON_GAME_SUBSTRINGS = ['bluestacks', 'wallpaper engine', 'visual studio', 'vscode', 'spotify', 'custom status'];

function isGameItem(item) {
    if (!item) return false;
    const cat = (item.category || item.type || '').toLowerCase().trim();
    if (NON_GAME_CATEGORIES.has(cat)) return false;
    const type = (item.type || '').toLowerCase().trim();
    if (NON_GAME_CATEGORIES.has(type)) return false;
    const name = (item.name || item.game_name || item.game_key || '').toLowerCase().trim();
    for (let i = 0; i < NON_GAME_SUBSTRINGS.length; i++) {
        if (name.includes(NON_GAME_SUBSTRINGS[i])) return false;
    }
    return true;
}

function countUniqueGamePlayers(games) {
    if (!Array.isArray(games)) return 0;
    const uniquePlayers = new Set();
    let countWithoutPlayerLists = 0;
    let hasPlayerList = false;

    games.forEach(g => {
        if (!isGameItem(g)) return;
        const details = g.player_details || (Array.isArray(g.players) ? g.players : null);
        if (Array.isArray(details) && details.length > 0) {
            hasPlayerList = true;
            details.forEach(p => {
                const name = (typeof p === 'string' ? p : (p.name || '')).toLowerCase().trim();
                if (name) uniquePlayers.add(name);
            });
        } else {
            countWithoutPlayerLists += (g.player_count || g.count || 1);
        }
    });

    return hasPlayerList ? (uniquePlayers.size + countWithoutPlayerLists) : countWithoutPlayerLists;
}

function normalizedStats(data, { fallback = false, observedAtMs = Date.now(), extra = {} } = {}) {
    const members = Number(fallback
        ? data?.total_members ?? data?.member_count
        : data?.ninja_nexus_members ?? data?.members);
    const totalUsers = Number(fallback
        ? data?.total_members ?? data?.member_count
        : data?.total_users ?? data?.ninja_nexus_members ?? data?.members);
    const servers = Number(fallback ? data?.server_count : data?.total_servers);
    const ping = Number(data?.ping);
    const uptimeSeconds = Number(data?.uptime_seconds);
    if (![members, totalUsers, servers, ping, uptimeSeconds]
        .every((value) => Number.isFinite(value) && value > 0)) {
        return null;
    }

    const nowSeconds = Math.floor(observedAtMs / 1000);
    const serverTime = Number(data?.server_time) > 0
        ? Number(data.server_time)
        : nowSeconds;
    const startedAt = Number(data?.started_at) > 0
        ? Number(data.started_at)
        : serverTime - uptimeSeconds;
    if (Math.abs((serverTime - startedAt) - uptimeSeconds) > 5) return null;

    const playingNow = (Number.isInteger(data?.playing_now) && data.playing_now >= 0)
        ? data.playing_now
        : (Number.isInteger(extra.playing_now) && extra.playing_now >= 0 ? extra.playing_now : null);

    const hoursPlayed = (Number.isFinite(data?.hours_played ?? data?.hours_week) && (data.hours_played ?? data.hours_week) >= 0)
        ? (data.hours_played ?? data.hours_week)
        : (Number.isFinite(extra.hours_played) && extra.hours_played >= 0 ? extra.hours_played : null);

    if (fallback) {
        const online = Number(data.online_members ?? data.online_count ?? data.online);
        const idle = Number(data.idle_members ?? data.idle_count ?? data.idle);
        const dnd = Number(data.dnd_members ?? data.dnd_count ?? data.dnd);
        const onlineMembers = [online, idle, dnd].every(
            (value) => Number.isInteger(value) && value >= 0
        ) ? online + idle + dnd : null;
        return {
            uptime: data.uptime ?? data.uptime_str ?? '',
            uptime_seconds: uptimeSeconds,
            started_at: startedAt,
            server_time: serverTime,
            total_users: totalUsers,
            ninja_nexus_members: members,
            members: members,
            online_members: onlineMembers,
            online: onlineMembers,
            online_count: Number(data.online_count ?? data.online_members) || 0,
            total_servers: servers,
            ping,
            playing_now: playingNow,
            hours_played: hoursPlayed,
            hours_week: hoursPlayed,
            stale: false
        };
    }
    return {
        ...data,
        uptime_seconds: uptimeSeconds,
        started_at: startedAt,
        server_time: serverTime,
        total_users: totalUsers,
        ninja_nexus_members: members,
        members: members,
        online_members: Number.isInteger(data.online_members ?? data.online) && (data.online_members ?? data.online) >= 0
            ? (data.online_members ?? data.online) : null,
        online: Number.isInteger(data.online_members ?? data.online) && (data.online_members ?? data.online) >= 0
            ? (data.online_members ?? data.online) : null,
        total_servers: servers,
        ping,
        playing_now: playingNow,
        hours_played: hoursPlayed,
        hours_week: hoursPlayed,
        stale: false
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    // Parallel fetch of primary stats plus live sessions and most-played to guarantee real values for playing_now & hours_played
    const [hit, liveHit, mpHit] = await Promise.all([
        fetchUpstream(
            '/api/public_stats',
            3500,
            'public_stats',
            {
                retries: 1,
                retryDelayMs: 1000,
                maxDurationMs: 8000,
                retryStatuses: [500, 502, 503, 504]
            }
        ),
        fetchUpstream('/api/public/live', 2500, 'public_stats_live'),
        fetchUpstream('/api/public/most-played?range=7d', 2500, 'public_stats_mp')
    ]);

    let extraPlayingNow = null;
    let extraHoursPlayed = null;

    if (liveHit?.res?.ok) {
        try {
            const liveData = await liveHit.res.json();
            if (Array.isArray(liveData?.games)) {
                extraPlayingNow = countUniqueGamePlayers(liveData.games);
            }
        } catch (e) {}
    }
    if (mpHit?.res?.ok) {
        try {
            const mpData = await mpHit.res.json();
            if (Array.isArray(mpData?.games)) {
                extraHoursPlayed = Math.round(mpData.games.reduce((acc, g) => {
                    if (!isGameItem(g)) return acc;
                    const h = Number(g.total_hours);
                    return acc + (Number.isFinite(h) && h > 0 ? h : 0);
                }, 0));
            }
        } catch (e) {}
    }

    let failureReason = null;
    if (hit) {
        try {
            if (!hit.res.ok) {
                failureReason = 'upstream_http_error';
                throw new Error(`upstream returned HTTP ${hit.res.status}`);
            }
            const data = await hit.res.json();
            if (extraPlayingNow === null && Array.isArray(data?.playing_games)) {
                extraPlayingNow = countUniqueGamePlayers(data.playing_games);
            }
            const normalized = normalizedStats(data, {
                observedAtMs: Date.now() - hit.ms,
                extra: { playing_now: extraPlayingNow, hours_played: extraHoursPlayed }
            });
            if (normalized) {
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json(normalized);
            }
            failureReason = 'invalid_upstream_stats';
            console.log('[public_stats] primary stats payload did not contain valid counts');
        } catch (e) {
            console.log(`[public_stats] ${hit.base} bad JSON: ${e.message}`);
            failureReason ||= 'invalid_upstream_response';
        }
    }

    // The bot's public guest stats route is a verified aggregate-only fallback.
    const fallback = await fetchUpstream('/api/stats', 1500, 'public_stats_fallback', {
        maxDurationMs: 1500
    });
    if (fallback?.res.ok) {
        try {
            const data = await fallback.res.json();
            const normalized = normalizedStats(data, {
                fallback: true,
                observedAtMs: Date.now() - fallback.ms,
                extra: { playing_now: extraPlayingNow, hours_played: extraHoursPlayed }
            });
            if (normalized) {
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json(normalized);
            }
            failureReason ||= 'invalid_fallback_stats';
        } catch (e) {
            console.log(`[public_stats] fallback stats response invalid: ${e.message}`);
            failureReason ||= 'invalid_fallback_response';
        }
    } else if (fallback) {
        failureReason ||= 'fallback_http_error';
    } else if (!failureReason) {
        failureReason = getUpstreamFailure('public_stats_fallback').reason;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
        error: 'bot_stats_unavailable',
        reason: failureReason || getUpstreamFailure('public_stats').reason
    });
}
