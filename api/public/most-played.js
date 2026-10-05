import { fetchUpstream, sanitizeGameRow } from '../../_nexus.js';

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
        'most-played'
    );
    if (hit) {
        try {
            const data = await hit.res.json();
            // Accept per-GAME payloads from the new bot API AND the legacy
            // shape ({name, total_hours, unique_players, rich_cover}).
            // Member leaderboards (voice_stats: display_name/total_seconds,
            // no game name fields) are REJECTED — never map members to games.
            // Cover URLs are re-resolved to website-local art (never the
            // bot's absolute URLs) so cards can't hang or mix content.
            const list = Array.isArray(data.games) ? data.games : [];
            const games = list
                .filter((g) => g && (g.game_key || g.name || g.game_name))
                .slice(0, 9)
                .map((g, i) => sanitizeGameRow(g, i));
            if (games.length > 0) {
                console.log(`[most-played] serving ${games.length} games from ${hit.base} in ${hit.ms}ms`);
                return res.status(200).json({
                    generated_at: data.generated_at || Date.now(),
                    range: data.range || data.period || range,
                    games,
                    stale: false
                });
            }
            console.log(`[most-played] ${hit.base} returned no usable games`);
        } catch (e) {
            console.log(`[most-played] ${hit.base} bad JSON: ${e.message}`);
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
