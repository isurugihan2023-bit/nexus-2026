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
        const started = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const upstream = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' }
            });
            clearTimeout(timeoutId);
            console.log(`[live] upstream ${url} -> ${upstream.status} in ${Date.now() - started}ms`);
            if (upstream.ok) {
                const data = await upstream.json();
                if (data && Array.isArray(data.games)) {
                    console.log(`[live] serving ${data.games.length} games (${data.total_playing ?? 0} playing) from ${url}`);
                    return res.status(200).json({ ...data, stale: false });
                }
                console.log(`[live] ${url} returned no games array`);
            } else if (upstream.status === 401) {
                console.log(`[live] ${url} requires auth (401) — new bot API not deployed or route not whitelisted there`);
            }
        } catch (e) {
            console.log(`[live] upstream ${url} failed in ${Date.now() - started}ms: ${e.message}`);
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
    // 157.90.181.183:23063 is the current bot host; 92.x is the legacy fallback.
    return ['http://157.90.181.183:23063', 'http://92.118.206.166:30038'];
}
