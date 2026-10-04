export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'public, max-age=5, s-maxage=5, stale-while-revalidate=10');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const upstreams = upstreamBases().map((b) => `${b}/api/public/live`);

    for (const url of upstreams) {
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
                    return res.status(200).json({ ...data, stale: false });
                }
            }
        } catch (e) {
            // try next upstream, then graceful empty below
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

function upstreamBases() {
    const env = (process.env.BOT_UPSTREAM || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (env.length > 0) return env;
    return ['http://92.118.206.166:30038', 'http://157.90.181.183:23063'];
}
