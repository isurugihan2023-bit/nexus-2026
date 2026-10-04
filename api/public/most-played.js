export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=120');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const raw = ((req.query?.range || req.query?.period || '7d') + '').toLowerCase().trim();
    const range = ['7d', 'week', '30d', 'month', 'all', '24h', 'day'].includes(raw) ? raw : '7d';

    for (const url of upstreamBases().map((b) => `${b}/api/public/most-played?range=${encodeURIComponent(range)}`)) {
        const started = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const upstream = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            });
            clearTimeout(timeoutId);
            console.log(`[most-played] upstream ${url} -> ${upstream.status} in ${Date.now() - started}ms`);
            if (upstream.ok) {
                const data = await upstream.json();
                // Accept per-GAME payloads from the new bot API AND the legacy
                // shape ({name, total_hours, unique_players, rich_cover}).
                // Member leaderboards (voice_stats: display_name/total_seconds,
                // no game name fields) are REJECTED — never map members to games.
                const list = Array.isArray(data.games) ? data.games : [];
                const games = list
                    .filter((g) => g && (g.game_key || g.name || g.game_name))
                    .slice(0, 9)
                    .map((g, i) => {
                        const name = g.name || g.game_name || 'Game';
                        return {
                            rank: g.rank ?? i + 1,
                            game_key: g.game_key || slug(name),
                            name,
                            category: g.category || 'Gaming',
                            image: g.image || g.rich_cover || 'images/games/fallback.svg',
                            rich_cover: g.rich_cover || null,
                            unique_players: g.unique_players ?? 0,
                            total_hours: g.total_hours ?? 0,
                            sessions: g.sessions ?? 0,
                            top_players: Array.isArray(g.top_players) ? g.top_players.slice(0, 4) : []
                        };
                    });
                if (games.length > 0) {
                    console.log(`[most-played] serving ${games.length} games from ${url}`);
                    return res.status(200).json({
                        generated_at: data.generated_at || Date.now(),
                        range: data.range || data.period || range,
                        games,
                        stale: false
                    });
                }
                console.log(`[most-played] ${url} returned no usable games`);
            }
        } catch (e) {
            console.log(`[most-played] upstream ${url} failed in ${Date.now() - started}ms: ${e.message}`);
        }
    }

    // Graceful empty — never mock games, never invent member-named cards.
    return res.status(200).json({
        generated_at: Date.now(),
        range,
        games: [],
        stale: true
    });
}

function upstreamBases() {
    const env = (process.env.BOT_UPSTREAM || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (env.length > 0) return env;
    // 157.90.181.183:23063 is the current bot host; 92.x is the legacy fallback.
    return ['http://157.90.181.183:23063', 'http://92.118.206.166:30038'];
}

function slug(name) {
    return String(name || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}
