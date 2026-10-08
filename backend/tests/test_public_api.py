"""backend/tests/test_public_api.py - public live/most-played payload contracts.

Stubs aiohttp (not installed in CI) so the router's pure payload builders
can be verified: shape, grouping, privacy, no Discord IDs, avatar size=64.
"""
import asyncio
import json
import os
import sys
import tempfile
import time
import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

# ── minimal aiohttp stub ──
_aiohttp = types.ModuleType("aiohttp")
_web = types.ModuleType("aiohttp.web")


class _Resp:
    def __init__(self, *a, **k):
        self.status = k.get("status", 200)
        self.headers = k.get("headers", {})
        self.body = k.get("body", b"")


class _Stream:
    def __init__(self, *a, **k):
        self.headers = {}
        self.content_type = ""


class _App:
    def __init__(self):
        self.router = self

    def add_get(self, *a, **k):
        pass

    def add_route(self, *a, **k):
        pass


_web.Response = _Resp
_web.StreamResponse = _Stream
_web.Application = _App
_web.Request = object
_web.json_response = lambda data, *a, **k: _Resp(
    status=k.get("status", 200),
    body=json.dumps(data).encode("utf-8"),
    headers=k.get("headers", {}))


class _Timeout(Exception):
    pass


_aiohttp.web = _web
_aiohttp.ClientSession = object
_aiohttp.ClientTimeout = object
_aiohttp.WSMsgType = object
sys.modules.setdefault("aiohttp", _aiohttp)
sys.modules.setdefault("aiohttp.web", _web)

from backend.db import GamingDatabase
from backend.public_api import PublicApiRouter, _avatar64, _parse_range

NOW = int(time.time() * 1000)
H = 3600 * 1000


def run_tests():
    with tempfile.TemporaryDirectory() as tmp:
        db = GamingDatabase(os.path.join(tmp, "pub.db"))
        # u1 VALORANT 2h (open), u2 VALORANT 1h closed, u3 Dota 30m open
        db.open_game_session("g", "u1", "Alice", "https://cdn.discordapp.com/avatars/1/aaa.png?size=128",
                             "valorant", "VALORANT", "Competitive", "", NOW - 2 * H, NOW - 2 * H)
        db.heartbeat_game_session("u1", "valorant", now_ms=NOW)
        db.open_game_session("g", "u2", "Bob", "https://cdn.discordapp.com/avatars/2/bbb.png",
                             "valorant", "VALORANT", "", "", NOW - 2 * H, NOW - 2 * H)
        db.close_user_game_sessions("u2", ended_at=NOW - H)
        db.open_game_session("g", "u3", "Cara", "", "dota-2", "Dota 2", "Ranked", "",
                             NOW - 1800 * 1000, NOW - 1800 * 1000)

        router = PublicApiRouter(db)

        print("[TEST] live payload groups by game, no IDs...")
        live = asyncio.run(router._build_live())
        assert set(live) >= {"generated_at", "games", "total_playing"}, live.keys()
        assert live["total_playing"] == 2, live
        by_key = {g["game_key"]: g for g in live["games"]}
        assert set(by_key) == {"valorant", "dota-2"}, by_key
        v = by_key["valorant"]
        assert v["player_count"] == 1 and v["players"][0]["name"] == "Alice", v
        assert "size=64" in v["players"][0]["avatar"], v
        assert "category" in v and "image" in v, v
        blob = str(live)
        assert "u1" not in blob and "u2" not in blob and "u3" not in blob, "IDs leaked"
        assert abs(live["generated_at"] - int(time.time() * 1000)) < 60_000

        print("[TEST] opted-out members excluded from public output...")
        db.set_privacy_optout("u1", True)
        live2 = asyncio.run(router._build_live())
        assert live2["total_playing"] == 1, live2
        assert live2["games"][0]["game_key"] == "dota-2", live2
        db.set_privacy_optout("u1", False)

        print("[TEST] most-played grouped BY GAME, sorted by hours...")
        mp = asyncio.run(router._build_most_played(7 * 24 * H, "7d"))
        assert mp["range"] == "7d" and len(mp["games"]) <= 9, mp
        assert mp["games"][0]["game_key"] == "valorant", mp
        assert mp["games"][0]["unique_players"] == 2, mp
        assert abs(mp["games"][0]["total_hours"] - 3.0) < 0.2, mp
        assert all("user_id" not in g and "discord_user_id" not in g for g in mp["games"])
        import re as _re
        assert not _re.search(r"\b\d{15,25}\b", str(mp["games"])), "raw ID leaked"
        for g in mp["games"]:
            assert set(g) >= {"rank", "game_key", "name", "category", "image",
                              "unique_players", "total_hours"}, g.keys()
        debug_counts = db.get_game_session_debug_counts(NOW - 7 * 24 * H, NOW)
        assert debug_counts == {
            "rows_in_window": 3,
            "rows_total": 3,
            "oldest_started_at": NOW - 2 * H,
            "newest_started_at": NOW - 30 * 60 * 1000,
            "open_sessions": 2
        }, debug_counts
        debug_request = types.SimpleNamespace(
            method="GET",
            headers={},
            remote="debug-test",
            query={"range": "7d", "debug": "1"})
        debug_response = asyncio.run(router.get_most_played(debug_request))
        debug_body = json.loads(debug_response.body)
        assert set(debug_body) == {
            "rows_in_window", "rows_total", "oldest_started_at",
            "newest_started_at", "open_sessions", "window_start",
            "window_end", "cache_age_seconds"
        }, debug_body
        assert debug_body["rows_in_window"] == 3
        assert debug_body["open_sessions"] == 2
        assert debug_response.headers["Cache-Control"] == "no-store"

        print("[TEST] empty database remains a valid empty result...")
        empty_db = GamingDatabase(os.path.join(tmp, "empty.db"))
        empty_router = PublicApiRouter(empty_db)
        empty_mp = asyncio.run(empty_router._build_most_played(7 * 24 * H, "7d"))
        assert empty_mp["games"] == [], empty_mp
        assert empty_db.get_game_session_debug_counts(
            NOW - 7 * 24 * H, NOW) == {
                "rows_in_window": 0,
                "rows_total": 0,
                "oldest_started_at": None,
                "newest_started_at": None,
                "open_sessions": 0
            }

        print("[TEST] range parsing + avatar helper...")
        assert _parse_range("7d") == 7 * 24 * H
        assert _parse_range("week") == 7 * 24 * H
        assert _parse_range("30d") == 30 * 24 * H
        assert _parse_range("bogus") == 7 * 24 * H
        assert _avatar64("https://cdn.discordapp.com/avatars/1/aaa.png?size=128") == \
            "https://cdn.discordapp.com/avatars/1/aaa.png?size=64"

        print("[TEST] ALL PUBLIC API TESTS PASSED [OK]")


if __name__ == "__main__":
    run_tests()
