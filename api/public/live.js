import { fetchUpstream, sanitizeGameRow } from '../_nexus.js';

let lastGoodLive = null;

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const hit = await fetchUpstream('/api/public/live', 2500, 'live');
    if (hit) {
        try {
            if (!hit.res.ok) {
                throw new Error(`upstream returned HTTP ${hit.res.status}`);
            }
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
                if (data.stale === true && games.length === 0) {
                    throw new Error('upstream returned a stale empty snapshot');
                }
                if (games.length === 0 && data.games.length > 0) {
                    throw new Error('upstream returned no usable game rows');
                }
                const payload = {
                    ...data,
                    games,
                    total_playing: data.total_playing ?? games.length,
                    stale: data.stale === true
                };
                if (!payload.stale) lastGoodLive = payload;
                res.setHeader('Cache-Control', games.length === 0 || payload.stale
                    ? 'public, max-age=3, s-maxage=3'
                    : 'public, max-age=5, s-maxage=5, stale-while-revalidate=15');
                console.log(`[live] serving ${games.length} games from ${hit.base} in ${hit.ms}ms`);
                return res.status(200).json(payload);
            }
            throw new Error('upstream returned an invalid live payload');
        } catch (e) {
            console.log(`[live] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    if (lastGoodLive) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ ...lastGoodLive, stale: true });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'bot_unavailable' });
}
