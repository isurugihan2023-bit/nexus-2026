import { fetchUpstream } from '../../_nexus.js';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID'
};

function fail(res, status, error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({ error });
}

export default async function handler(req, res) {
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
        res.setHeader(name, value);
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return fail(res, 405, 'method not allowed');

    const hit = await fetchUpstream('/api/public/live/stream', 5000, 'live-stream');
    if (!hit) return fail(res, 503, 'bot_unavailable');
    if (!hit.res.ok || !hit.res.headers.get('content-type')?.includes('text/event-stream')
            || !hit.res.body) {
        try { await hit.res.body?.cancel(); } catch {}
        return fail(res, 503, 'live_stream_unavailable');
    }

    const reader = hit.res.body.getReader();
    let clientClosed = false;
    let ended = false;
    const closeClient = () => {
        clientClosed = true;
        if (!ended) reader.cancel().catch(() => {});
    };
    res.once('close', closeClient);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.status(200);
    res.flushHeaders?.();

    const maxDuration = setTimeout(() => {
        if (!ended) reader.cancel().catch(() => {});
    }, 20000);
    try {
        while (!clientClosed) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) {
                await new Promise((resolve) => res.once('drain', resolve));
            }
        }
    } catch (error) {
        if (!clientClosed) {
            console.log(`[live-stream] relay from ${hit.base} ended: ${error.message}`);
        }
    } finally {
        ended = true;
        clearTimeout(maxDuration);
        res.removeListener('close', closeClient);
        try { await reader.cancel(); } catch {}
        if (!res.writableEnded) res.end();
    }
}
