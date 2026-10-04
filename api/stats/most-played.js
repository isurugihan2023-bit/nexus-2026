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
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const upstream = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            });
            clearTimeout(timeoutId);
            if (upstream.ok) {
                const data = await upstream.json();
                if (data && Array.isArray(data.games)) {
                    const games = data.games
                        .filter((g) => g && (g.game_key || g.name))
                        .slice(0, 9)
                        .map((g, i) => ({
                            rank: g.rank ?? i + 1,
                            game_key: g.game_key || slug(g.name),
                            name: g.name || 'Game',
                            category: g.category || 'Gaming',
                            image: g.image || 'images/games/fallback.svg',
                            unique_players: g.unique_players ?? 0,
                            total_hours: g.total_hours ?? 0,
                            top_players: Array.isArray(g.top_players) ? g.top_players.slice(0, 4) : []
                        }));
                    return res.status(200).json({
                        generated_at: data.generated_at || Date.now(),
                        range: data.range || range,
                        games,
                        stale: false
                    });
                }
            }
        } catch (e) {
            // try next upstream, then graceful empty below
        }
    }

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
    return ['http://92.118.206.166:30038', 'http://157.90.181.183:23063'];
}

function slug(name) {
    return String(name || 'game').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'game';
}
