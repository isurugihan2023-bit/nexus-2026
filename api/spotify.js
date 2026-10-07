import { fetchUpstream } from './_nexus.js';

// GET /api/spotify — same-origin Spotify "Now Listening" proxy.
// Proxies to bot /api/public/spotify via getBotBaseUrl() with a 3s timeout.
// Offline -> clean empty state (never 502, never a bot IP in client code).
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    res.setHeader('Cache-Control', 'public, max-age=2, s-maxage=2, stale-while-revalidate=10');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    const hit = await fetchUpstream('/api/public/spotify', 3000, 'spotify');
    if (hit) {
        try {
            const data = await hit.res.json();
            if (data && Array.isArray(data.listeners)) {
                const listeners = data.listeners
                    .filter((l) => l && (l.title || l.artist))
                    .slice(0, 50)
                    .map((l) => ({
                        name: String(l.name || 'Member').slice(0, 32),
                        avatar: String(l.avatar || ''),
                        title: String(l.title || '').slice(0, 140),
                        artist: String(l.artist || '').slice(0, 200),
                        album: String(l.album || '').slice(0, 140),
                        art: String(l.art || '').slice(0, 500),
                        track_url: String(l.track_url || '').slice(0, 300),
                        start: l.start ?? null,
                        end: l.end ?? null
                    }));
                return res.status(200).json({
                    generated_at: data.generated_at || Date.now(),
                    listeners,
                    total: data.total ?? listeners.length,
                    stale: false
                });
            }
            console.log(`[spotify] ${hit.base} returned no listeners array`);
        } catch (e) {
            console.log(`[spotify] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    // Graceful empty — never mock tracks, never 502. Frontend renders the
    // "Nobody is listening right now" empty state.
    return res.status(200).json({
        generated_at: Date.now(),
        listeners: [],
        total: 0,
        stale: true
    });
}
