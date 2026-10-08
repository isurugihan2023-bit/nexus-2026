import { fetchUpstream, getUpstreamFailure } from './_nexus.js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const hit = await fetchUpstream(
        '/api/public_stats',
        3500,
        'public_stats',
        {
            retries: 1,
            retryDelayMs: 1000,
            maxDurationMs: 8000,
            retryStatuses: [500, 502, 503, 504]
        }
    );
    let failureReason = null;
    if (hit) {
        try {
            if (!hit.res.ok) {
                failureReason = 'upstream_http_error';
                throw new Error(`upstream returned HTTP ${hit.res.status}`);
            }
            const data = await hit.res.json();
            const members = Number(data?.ninja_nexus_members);
            const servers = Number(data?.total_servers);
            const ping = Number(data?.ping);
            const startedAt = Number(data?.started_at);
            const serverTime = Number(data?.server_time);
            const uptimeSeconds = Number(data?.uptime_seconds);
            if (data && [members, servers, ping, startedAt, serverTime, uptimeSeconds]
                .every((value) => Number.isFinite(value) && value > 0)
                && Math.abs((serverTime - startedAt) - uptimeSeconds) <= 3) {
                return res.status(200).json({ ...data, stale: false });
            }
            failureReason = 'invalid_upstream_stats';
            throw new Error('upstream is missing valid live stats');
        } catch (e) {
            console.log(`[public_stats] ${hit.base} bad JSON: ${e.message}`);
            failureReason ||= 'invalid_upstream_response';
        }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
        error: 'bot_stats_unavailable',
        reason: failureReason || getUpstreamFailure('public_stats').reason
    });
}
