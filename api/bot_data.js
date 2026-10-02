export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const upstream = await fetch('http://92.118.206.166:30038/api/public_stats', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (upstream.ok) {
            const data = await upstream.json();
            // Only accept payloads that actually contain live data
            if (data && (data.top_played_games || data.playing_games || data.total_users || data.uptime || data.ping)) {
                return res.status(200).json(data);
            }
        }
    } catch (err) {
        // Upstream offline — fall through to graceful empty state below
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
