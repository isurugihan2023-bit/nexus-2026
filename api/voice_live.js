import { fetchUpstream } from './_nexus.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=15, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const hit = await fetchUpstream('/api/voice_live', 2500, 'voice_live');
    if (hit) {
        try {
            const data = await hit.res.json();
            // Normalize to every shape the frontend understands:
            // {count, members} (voice) + {games, top_played_games} (lounge).
            const members = Array.isArray(data.members) ? data.members : (Array.isArray(data.games) ? data.games : []);
            const games = Array.isArray(data.games) ? data.games : members;
            return res.status(200).json({
                ...data,
                count: data.count ?? members.length,
                members,
                games,
                top_played_games: Array.isArray(data.top_played_games) ? data.top_played_games : games,
                stale: false
            });
        } catch (e) {
            console.log(`[voice_live] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    return res.status(200).json({
        count: 0,
        members: [],
        games: [],
        top_played_games: [],
        playing_games: [],
        stale: true
    });
}
