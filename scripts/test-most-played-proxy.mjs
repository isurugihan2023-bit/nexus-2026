import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.BOT_FALLBACK_URL = 'http://bot.test';

const { default: handler } = await import('../api/public/most-played.js');

function responseRecorder() {
    return {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(value) {
            this.body = value;
            return this;
        },
        end() {
            return this;
        }
    };
}

function mockFetch(payload, status = 200) {
    globalThis.fetch = async () => {
        if (payload instanceof Error) throw payload;
        return new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    };
}

test('unreachable origin errors; empty is explicit; stale good games survive refresh errors', async () => {
    const request = { method: 'GET', query: { range: '7d' } };
    let response = responseRecorder();

    mockFetch(new Error('bot unreachable'));
    await handler(request, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'bot_unavailable' });
    assert.equal(response.headers['Cache-Control'], 'no-store');

    const game = {
        game_key: 'valorant',
        name: 'VALORANT',
        unique_players: 2,
        total_hours: 3
    };
    mockFetch({ range: '7d', games: [game] });
    response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.games[0].name, 'VALORANT');
    assert.equal(response.body.stale, false);

    mockFetch({ range: '7d', games: [] });
    response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.games, []);
    assert.equal(response.headers['Cache-Control'], 'public, max-age=3, s-maxage=3');

    mockFetch(new Error('bot unreachable'));
    response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.games[0].name, 'VALORANT');
    assert.equal(response.body.stale, true);

    mockFetch({ range: '7d', games: [game], stale: true });
    response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.stale, true);
    assert.equal(response.headers['Cache-Control'], 'public, max-age=3, s-maxage=3');
});

test('debug request is forwarded without game rows', async () => {
    const debug = {
        rows_in_window: 4,
        rows_total: 10,
        oldest_started_at: 50,
        newest_started_at: 150,
        open_sessions: 2,
        window_start: 100,
        window_end: 200,
        cache_age_seconds: 1,
        games: [{ name: 'must not be exposed' }]
    };
    mockFetch(debug);
    const response = responseRecorder();
    await handler({ method: 'GET', query: { range: '7d', debug: '1' } }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body, {
        rows_in_window: 4,
        rows_total: 10,
        oldest_started_at: 50,
        newest_started_at: 150,
        open_sessions: 2,
        window_start: 100,
        window_end: 200,
        cache_age_seconds: 1
    });
    assert.equal(response.headers['Cache-Control'], 'no-store');

    mockFetch({ games: [{ name: 'old bot response' }] });
    const unsupported = responseRecorder();
    await handler({ method: 'GET', query: { range: '7d', debug: '1' } }, unsupported);
    assert.equal(unsupported.statusCode, 503);
    assert.deepEqual(unsupported.body, { error: 'bot_unavailable' });
});
