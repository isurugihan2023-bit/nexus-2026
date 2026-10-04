export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const range = (req.query?.range || 'week').toLowerCase().trim();
    const validRange = ['week', 'month', 'all'].includes(range) ? range : 'week';
    const limit = Math.min(50, Math.max(1, parseInt(req.query?.limit, 10) || 6));

    // Try fetching live stats from bot daemon
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const upstream = await fetch(`http://92.118.206.166:30038/api/voice_stats?range=${validRange}&limit=${limit}`, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (upstream.ok) {
            const data = await upstream.json();
            if (data && ((data.leaderboard && data.leaderboard.length > 0) || (data.top && data.top.length > 0))) {
                return res.status(200).json({
                    ...data,
                    stale: false
                });
            }
        }
    } catch (e) {
        // Upstream offline or timeout, fall through to verified range snapshot
    }

    // Graceful empty — no hardcoded member snapshots (privacy + wrong-data fix).
    // Voice rankings come only from the live bot daemon above.
    return res.status(200).json({
        success: true,
        range: validRange,
        generated_at: Date.now(),
        stale: true,
        leaderboard: [],
        top: [],
        live: []
    });
}
