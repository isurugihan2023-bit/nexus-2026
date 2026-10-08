import { fetchUpstream, getUpstreamFailure, sanitizeGameRow } from '../_nexus.js';

const lastGoodByRange = new Map();

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'method not allowed' });
    }

    const raw = ((req.query?.range || req.query?.period || '7d') + '').toLowerCase().trim();
    const range = ['7d', 'week', '30d', 'month', 'all', '24h', 'day'].includes(raw) ? raw : '7d';
    const debug = req.query?.debug === '1';
    res.setHeader('Cache-Control', debug ? 'no-store' : 'public, max-age=3, s-maxage=3');

    const hit = await fetchUpstream(
        `/api/public/most-played?range=${encodeURIComponent(range)}${debug ? '&debug=1' : ''}`,
        3500,
        'most-played',
        { retries: 1, retryDelayMs: 1000, maxDurationMs: 8000 }
    );
    let responseFailureReason = null;
    if (hit) {
        try {
            if (!hit.res.ok) {
                responseFailureReason = 'upstream_http_error';
                throw new Error(`upstream returned HTTP ${hit.res.status}`);
            }
            const data = await hit.res.json();
            if (debug) {
                const fields = [
                    'rows_in_window', 'rows_total', 'oldest_started_at',
                    'newest_started_at', 'window_start', 'window_end',
                    'open_sessions', 'cache_age_seconds'
                ];
                const cacheAge = data?.cache_age_seconds ?? data?.snapshot_age_seconds;
                if (!data || fields.some((field) => field === 'cache_age_seconds'
                    || field === 'oldest_started_at' || field === 'newest_started_at'
                    ? (field === 'cache_age_seconds' ? cacheAge : data[field]) !== null
                        && !Number.isFinite(field === 'cache_age_seconds' ? cacheAge : data[field])
                    : !Number.isFinite(data[field]))) {
                    throw new Error('upstream returned invalid debug counts');
                }
                return res.status(200).json(Object.fromEntries(
                    fields.map((field) => [
                        field,
                        (field === 'cache_age_seconds' ? cacheAge : data[field]) ?? null
                    ])
                ));
            }
            // Accept per-GAME payloads from the new bot API AND the legacy
            // shape ({name, total_hours, unique_players, rich_cover}).
            // Member leaderboards (voice_stats: display_name/total_seconds,
            // no game name fields) are REJECTED — never map members to games.
            // Cover URLs are re-resolved to website-local art (never the
            // bot's absolute URLs) so cards can't hang or mix content.
            if (!data || !Array.isArray(data.games)) {
                throw new Error('upstream returned an invalid most-played payload');
            }
            const list = data.games;
            const games = list
                .filter((g) => g && (g.game_key || g.name || g.game_name))
                .slice(0, 9)
                .map((g, i) => sanitizeGameRow(g, i));
            if (games.length > 0) {
                const stale = data.stale === true;
                const payload = {
                    generated_at: data.generated_at || Date.now(),
                    range: data.range || data.period || range,
                    games,
                    stale
                };
                if (!stale) lastGoodByRange.set(range, payload);
                res.setHeader('Cache-Control', stale
                    ? 'public, max-age=3, s-maxage=3'
                    : 'public, max-age=15, s-maxage=15, stale-while-revalidate=15');
                console.log(`[most-played] serving ${games.length} games from ${hit.base} in ${hit.ms}ms`);
                return res.status(200).json(payload);
            }
            if (list.length === 0 && data.stale !== true) {
                return res.status(200).json({
                    generated_at: data.generated_at || Date.now(),
                    range: data.range || data.period || range,
                    games: [],
                    stale: false
                });
            }
            if (list.length > 0 || data.stale === true) {
                throw new Error('upstream returned no usable current games');
            }
            console.log(`[most-played] ${hit.base} returned no usable games`);
        } catch (e) {
            responseFailureReason ||= 'invalid_upstream_response';
            console.log(`[most-played] ${hit.base} bad JSON: ${e.message}`);
        }
    }

    if (debug) {
        return res.status(503).json({
            error: 'bot_unavailable',
            reason: responseFailureReason || getUpstreamFailure('most-played').reason
        });
    }
    const lastGood = lastGoodByRange.get(range);
    if (lastGood) {
        return res.status(200).json({ ...lastGood, stale: true });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({
        error: 'bot_unavailable',
        reason: responseFailureReason || getUpstreamFailure('most-played').reason
    });
}
