import { fetchUpstream, sanitizeGameRow } from '../_nexus.js';

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

    const hit = await fetchUpstream(
        `/api/public/most-played?range=${encodeURIComponent(range)}`,
        2500,
        'stats/most-played'
    );
    if (hit) {
        try {
            const data = await hit.res.json();
            const list = Array.isArray(data.games) ? data.games : [];
            const games = list
                .filter((g) => g && (g.game_key || g.name || g.game_name))
                .slice(0, 9)
                .map((g, i) => sanitizeGameRow(g, i));
            if (games.length > 0) {
                return res.status(200).json({
                    generated_at: data.generated_at || Date.now(),
                    range: data.range || data.period || range,
                    games,
                    stale: false
                });
            }
        } catch (e) {
            console.log(`[stats/most-played] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    return res.status(200).json({
        generated_at: Date.now(),
        range,
        games: [],
        stale: true
    });
}
