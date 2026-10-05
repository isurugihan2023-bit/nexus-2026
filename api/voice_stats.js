import { fetchUpstream } from './_nexus.js';

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

    const hit = await fetchUpstream(
        `/api/voice_stats?range=${validRange}&limit=${limit}`,
        2500,
        'voice_stats'
    );
    if (hit) {
        try {
            const data = await hit.res.json();
            if (data && ((data.leaderboard && data.leaderboard.length > 0) || (data.top && data.top.length > 0))) {
                return res.status(200).json({
                    ...data,
                    stale: false
                });
            }
        } catch (e) {
            console.log(`[voice_stats] ${hit.base} bad JSON: ${e.message}`);
        }
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
