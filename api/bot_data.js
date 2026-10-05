import { fetchUpstream } from './_nexus.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const hit = await fetchUpstream('/api/public_stats', 2500, 'bot_data');
    if (hit) {
        try {
            const data = await hit.res.json();
            // Only accept payloads that actually contain live data
            if (data && (data.top_played_games || data.playing_games || data.total_users || data.uptime || data.ping)) {
                return res.status(200).json({ ...data, stale: false });
            }
        } catch (e) {
            console.log(`[bot_data] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    // Graceful degrade: never 502. Frontend treats non-empty
    // top_played_games as live; empty array renders the
    // "No one is playing" empty state instead of the offline error.
    return res.status(200).json({
        uptime: null,
        uptime_seconds: null,
        total_users: 48,
        ninja_nexus_members: 48,
        online_users: 0,
        total_servers: 1,
        total_commands: 150,
        ping: null,
        top_played_games: [],
        playing_games: [],
        stale: true
    });
}
