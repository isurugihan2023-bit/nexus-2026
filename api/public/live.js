import { fetchUpstream, sanitizeGameRow } from '../_nexus.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const hit = await fetchUpstream('/api/public/live', 2500, 'live');
    if (hit) {
        try {
            const data = await hit.res.json();
            if (data && Array.isArray(data.games)) {
                const games = data.games
                    .filter((g) => g && (g.game_key || g.name || g.game_name))
                    .map((g, i) => {
                        const clean = sanitizeGameRow(
                            { ...g, name: g.name || g.game_name },
                            i
                        );
                        // Preserve live-session fields the cards need.
                        return {
                            ...clean,
                            players: Array.isArray(g.players) ? g.players : [],
                            player_details: Array.isArray(g.player_details)
                                ? g.player_details
                                : [],
                            player_count: g.player_count ?? g.count ?? 0,
                            count: g.player_count ?? g.count ?? 0,
                            sample_detail: g.sample_detail || '',
                            server_players: g.server_players || null
                        };
                    });
                console.log(`[live] serving ${games.length} games from ${hit.base} in ${hit.ms}ms`);
                return res.status(200).json({
                    ...data,
                    games,
                    total_playing: data.total_playing ?? games.length,
                    stale: false
                });
            }
            console.log(`[live] ${hit.base} returned no games array`);
        } catch (e) {
            console.log(`[live] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    // Graceful empty — never mock games, never 502. Frontend renders the
    // "Nobody is playing right now" empty state.
    return res.status(200).json({
        generated_at: Date.now(),
        games: [],
        total_playing: 0,
        stale: true
    });
}
