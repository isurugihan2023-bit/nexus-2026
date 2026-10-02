export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const period = ((req.query?.period || 'week') + '').toLowerCase().trim();
    const validPeriod = ['week', 'month', 'all'].includes(period) ? period : 'week';

    // Try the live bot daemon first (short timeout so the tab stays fast).
    // NOTE: /api/stats/* requires auth (401) — the public route is the live one.
    const upstreams = [
        `http://92.118.206.166:30038/api/public/most-played?period=${validPeriod}`,
        `http://92.118.206.166:30038/api/stats/most-played?period=${validPeriod}&limit=6`
    ];

    for (const url of upstreams) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const upstream = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeoutId);

            if (upstream.ok) {
                const data = await upstream.json();
                const games = normalizeGames(data);
                if (games.length > 0) {
                    return res.status(200).json({
                        status: 'success',
                        period: validPeriod,
                        count: games.length,
                        games,
                        stale: false
                    });
                }
            }
        } catch (e) {
            // Try next upstream, then fall through to static snapshot
        }
    }

    return res.status(200).json({
        status: 'success',
        period: validPeriod,
        count: FALLBACK_GAMES.length,
        games: FALLBACK_GAMES,
        stale: true
    });
}

function normalizeGames(data) {
    if (!data) return [];
    if (Array.isArray(data.games) && data.games.length > 0) {
        return data.games.map(normalizeGame).filter(Boolean);
    }
    // voice_stats shape: { leaderboard: [{ display_name, total_seconds, ... }] }
    if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
        return data.leaderboard.slice(0, 6).map((u) => {
            const hours = Math.max(1, Math.round((u.total_seconds || 0) / 3600));
            return {
                game_name: u.display_name || u.handle || 'Game',
                total_hours: hours,
                unique_players: 1,
                sessions: Math.max(1, Math.round(hours / 2))
            };
        });
    }
    if (Array.isArray(data.top) && data.top.length > 0) {
        return data.top.slice(0, 6).map((t) => ({
            game_name: t.name || 'Game',
            total_hours: parseHours(t.time),
            unique_players: 1,
            sessions: 2
        }));
    }
    return [];
}

function normalizeGame(g) {
    if (!g) return null;
    const game_name = g.game_name || g.name || null;
    if (!game_name) return null;
    return {
        game_name,
        total_hours: g.total_hours ?? g.hours ?? 0,
        unique_players: g.unique_players ?? g.player_count ?? g.players ?? 0,
        sessions: g.sessions ?? 0
    };
}

function parseHours(timeStr) {
    if (typeof timeStr !== 'string') return 4;
    const h = timeStr.match(/(\d+)\s*h/);
    return h ? parseInt(h[1], 10) : 4;
}

// Static weekly snapshot so the tab always renders, even while the
// bot daemon is restarting. Keys match GAME_IMAGE_OVERRIDES so covers resolve.
const FALLBACK_GAMES = [
    { game_name: 'VALORANT', total_hours: 38, unique_players: 6, sessions: 12 },
    { game_name: 'Ceylon Roleplay', total_hours: 32, unique_players: 5, sessions: 9 },
    { game_name: 'PUBG: BATTLEGROUNDS', total_hours: 24, unique_players: 4, sessions: 8 },
    { game_name: 'Dota 2', total_hours: 18, unique_players: 3, sessions: 6 },
    { game_name: 'Minecraft', total_hours: 14, unique_players: 4, sessions: 5 },
    { game_name: 'Roblox', total_hours: 11, unique_players: 3, sessions: 5 }
];
