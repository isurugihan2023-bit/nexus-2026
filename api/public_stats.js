import { fetchUpstream, getUpstreamFailure } from './_nexus.js';

function normalizedStats(data, { fallback = false, observedAtMs = Date.now() } = {}) {
    const members = Number(fallback
        ? data?.total_members ?? data?.member_count
        : data?.ninja_nexus_members);
    const totalUsers = Number(fallback
        ? data?.total_members ?? data?.member_count
        : data?.total_users ?? data?.ninja_nexus_members);
    const servers = Number(fallback ? data?.server_count : data?.total_servers);
    const ping = Number(data?.ping);
    const uptimeSeconds = Number(data?.uptime_seconds);
    if (![members, totalUsers, servers, ping, uptimeSeconds]
        .every((value) => Number.isFinite(value) && value > 0)) {
        return null;
    }

    const nowSeconds = Math.floor(observedAtMs / 1000);
    const serverTime = Number(data?.server_time) > 0
        ? Number(data.server_time)
        : nowSeconds;
    const startedAt = Number(data?.started_at) > 0
        ? Number(data.started_at)
        : serverTime - uptimeSeconds;
    if (Math.abs((serverTime - startedAt) - uptimeSeconds) > 5) return null;

    if (fallback) {
        return {
            uptime: data.uptime ?? data.uptime_str ?? '',
            uptime_seconds: uptimeSeconds,
            started_at: startedAt,
            server_time: serverTime,
            total_users: totalUsers,
            ninja_nexus_members: members,
            online_count: Number(data.online_count ?? data.online_members) || 0,
            total_servers: servers,
            ping,
            stale: false
        };
    }
    return {
        ...data,
        uptime_seconds: uptimeSeconds,
        started_at: startedAt,
        server_time: serverTime,
        total_users: totalUsers,
        ninja_nexus_members: members,
        total_servers: servers,
        ping,
        stale: false
    };
}

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
            const normalized = normalizedStats(data, {
                observedAtMs: Date.now() - hit.ms
            });
            if (normalized) return res.status(200).json(normalized);
            failureReason = 'invalid_upstream_stats';
            console.log('[public_stats] primary stats payload did not contain valid counts');
        } catch (e) {
            console.log(`[public_stats] ${hit.base} bad JSON: ${e.message}`);
            failureReason ||= 'invalid_upstream_response';
        }
    }

    // The bot's public guest stats route is a verified aggregate-only fallback.
    // Return only the four values needed by the page; do not forward server or
    // member details from its broader dashboard response.
    const fallback = await fetchUpstream('/api/stats', 1500, 'public_stats_fallback', {
        maxDurationMs: 1500
    });
    if (fallback?.res.ok) {
        try {
            const data = await fallback.res.json();
            const normalized = normalizedStats(data, {
                fallback: true,
                observedAtMs: Date.now() - fallback.ms
            });
            if (normalized) return res.status(200).json(normalized);
            failureReason ||= 'invalid_fallback_stats';
        } catch (e) {
            console.log(`[public_stats] fallback stats response invalid: ${e.message}`);
            failureReason ||= 'invalid_fallback_response';
        }
    } else if (fallback) {
        failureReason ||= 'fallback_http_error';
    } else if (!failureReason) {
        failureReason = getUpstreamFailure('public_stats_fallback').reason;
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
        error: 'bot_stats_unavailable',
        reason: failureReason || getUpstreamFailure('public_stats').reason
    });
}
