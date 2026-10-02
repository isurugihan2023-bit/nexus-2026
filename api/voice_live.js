export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=15, stale-while-revalidate=30');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);
        const upstream = await fetch('http://92.118.206.166:30038/api/voice_live', {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (upstream.ok) {
            const data = await upstream.json();
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
        }
    } catch (e) {
        // Fall through to empty live state
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
