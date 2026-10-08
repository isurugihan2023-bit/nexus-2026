import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

process.env.BOT_FALLBACK_URL = 'http://bot.test';

const { default: liveHandler } = await import('../api/public/live.js');
const { default: streamHandler } = await import('../api/public/live/stream.js');

function responseRecorder() {
    const response = new EventEmitter();
    response.headers = {};
    response.statusCode = 200;
    response.body = null;
    response.streamBody = '';
    response.writableEnded = false;
    response.setHeader = function (name, value) {
        this.headers[name] = value;
    };
    response.status = function (code) {
        this.statusCode = code;
        return this;
    };
    response.json = function (value) {
        this.body = value;
        return this;
    };
    response.write = function (chunk) {
        this.streamBody += chunk.toString();
        return true;
    };
    response.flushHeaders = function () {};
    response.end = function () {
        this.writableEnded = true;
    };
    return response;
}

function mockFetch(payload, status = 200) {
    globalThis.fetch = async () => {
        if (payload instanceof Error) throw payload;
        if (payload instanceof Response) return payload;
        return new Response(JSON.stringify(payload), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    };
}

const request = { method: 'GET', query: {} };

test('live proxy distinguishes failures, true empty, and stale last-good data', async () => {
    let response = responseRecorder();
    mockFetch(new Error('bot unreachable'));
    await liveHandler(request, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'bot_unavailable' });
    assert.equal(response.headers['Cache-Control'], 'no-store');

    const goodPayload = {
        generated_at: 123,
        games: [{
            game_key: 'valorant',
            name: 'VALORANT',
            player_count: 2,
            players: [{ name: 'Tester' }, { name: 'Member' }]
        }],
        total_playing: 2
    };
    mockFetch(goodPayload);
    response = responseRecorder();
    await liveHandler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.games.length, 1);
    assert.equal(response.body.stale, false);

    mockFetch(new Error('bot unreachable'));
    response = responseRecorder();
    await liveHandler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.stale, true);
    assert.equal(response.body.games[0].name, 'VALORANT');
    assert.equal(response.headers['Cache-Control'], 'no-store');

    mockFetch({ generated_at: 456, games: [], total_playing: 0 });
    response = responseRecorder();
    await liveHandler(request, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.games, []);
    assert.equal(response.body.stale, false);
    assert.equal(response.headers['Cache-Control'], 'public, max-age=3, s-maxage=3');

    mockFetch({ generated_at: 789, games: [], total_playing: 0, stale: true });
    response = responseRecorder();
    await liveHandler(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.stale, true);
    assert.deepEqual(response.body.games, []);
    assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('live SSE proxy relays the first snapshot and fails explicitly offline', async () => {
    const event = 'data: {"games":[{"name":"VALORANT","player_count":2}]}\n\n';
    mockFetch(new Response(event, {
        headers: { 'Content-Type': 'text/event-stream' }
    }));
    let response = responseRecorder();
    await streamHandler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.match(response.streamBody, /data: .*VALORANT/);
    assert.equal(response.writableEnded, true);

    mockFetch(new Error('bot unreachable'));
    response = responseRecorder();
    await streamHandler({ method: 'GET' }, response);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'bot_unavailable' });
    assert.equal(response.headers['Cache-Control'], 'no-store');
});
