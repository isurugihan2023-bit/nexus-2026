import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.BOT_FALLBACK_URL = 'http://bot.test';
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;

const { default: handler } = await import('../api/public_stats.js');

function responseRecorder() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; }
    };
}

function stats(overrides = {}) {
    return {
        uptime: '2m 0s',
        uptime_seconds: 120,
        started_at: 1000,
        server_time: 1120,
        total_users: 48,
        ninja_nexus_members: 48,
        total_servers: 1,
        ping: 229,
        online_count: 12,
        top_played_games: [],
        playing_games: [],
        ...overrides
    };
}

function mockFetch(payload, status = 200) {
    globalThis.fetch = async () => new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

test('returns validated live bot stats without CDN caching', async () => {
    mockFetch(stats());
    const response = responseRecorder();
    await handler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ninja_nexus_members, 48);
    assert.equal(response.body.started_at, 1000);
    assert.equal(response.body.stale, false);
    assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('unreachable and legacy fabricated stats remain explicit errors, not fake values', async () => {
    globalThis.fetch = async () => { throw new Error('bot unreachable'); };
    let response = responseRecorder();
    await handler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.error, 'bot_stats_unavailable');
    assert.equal('ninja_nexus_members' in response.body, false);
    assert.equal(response.headers['Cache-Control'], 'no-store');

    mockFetch(stats({ started_at: undefined, server_time: undefined }));
    response = responseRecorder();
    await handler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.reason, 'invalid_upstream_stats');
    assert.equal('total_servers' in response.body, false);
});

test('retries a transient connection failure once', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) throw new Error('temporary connection failure');
        return new Response(JSON.stringify(stats()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    const response = responseRecorder();
    await handler({ method: 'GET' }, response);
    assert.equal(calls, 2);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ninja_nexus_members, 48);
});

test('retries one upstream server error before succeeding', async () => {
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) {
            return new Response('unavailable', { status: 503 });
        }
        return new Response(JSON.stringify(stats()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    };
    const response = responseRecorder();
    await handler({ method: 'GET' }, response);
    assert.equal(calls, 2);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.ninja_nexus_members, 48);
});
