"""backend/tests/test_spotify.py - Spotify Now Listening contracts.

Verifies: song change updates entry, stop removes it, opted-out user
hidden, listening never creates a game session, TTL expiry, cap, no IDs.
"""
import asyncio
import os
import sys
import tempfile
import time
import types

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# ── minimal aiohttp stub (payload-level tests only) ──
_aiohttp = types.ModuleType("aiohttp")
_web = types.ModuleType("aiohttp.web")


class _Resp:
    def __init__(self, *a, **k):
        self.status = k.get("status", 200)
        self.headers = {}
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
_web.json_response = lambda *a, **k: _Resp(status=k.get("status", 200))
_aiohttp.web = _web
sys.modules.setdefault("aiohttp", _aiohttp)
sys.modules.setdefault("aiohttp.web", _web)

from db import GamingDatabase
from public_api import PublicApiRouter
import spotify_tracker as sp
import game_tracker as gt


class FakeSpotify:
    """Duck-typed discord.Spotify (class name matters for detection)."""
    def __init__(self, title, artists="Artist", album="Album", track_id="t1",
                 start=None, end=None, atype=2):
        self.type = atype
        self.name = "Spotify"
        self.title = title
        self.artists = [artists] if isinstance(artists, str) else list(artists)
        self.artist = artists if isinstance(artists, str) else "; ".join(artists)
        self.album = album
        self.album_cover_url = "https://i.scdn.co/image/abc"
        self.track_id = track_id
        self.track_url = f"https://open.spotify.com/track/{track_id}"
        self.start = start
        self.end = end


# Rename so type(member.activities[0]).__name__ == "Spotify"
FakeSpotify.__name__ = "Spotify"
import datetime as _dt


def _mk_spotify_cls():
    return type("Spotify", (), {})  # placeholder, replaced below


class _Avatar:
    def __init__(self, url="https://cdn.discordapp.com/avatars/1/aaa.png"):
        self.url = url


class _Member:
    def __init__(self, uid, name, activities, bot=False, status="online"):
        self.id = uid
        self.name = name
        self.display_name = name
        self.bot = bot
        self.activities = activities
        self.display_avatar = _Avatar()
        self.status = status


class _Guild:
    def __init__(self, members):
        self.id = 999
        self.members = list(members)


def _spot(title, track_id, start_ms=None, end_ms=None):
    s = None
    e = None
    if start_ms is not None:
        s = _dt.datetime.fromtimestamp(start_ms / 1000, tz=_dt.timezone.utc)
    if end_ms is not None:
        e = _dt.datetime.fromtimestamp(end_ms / 1000, tz=_dt.timezone.utc)
    obj = FakeSpotify(title, track_id=track_id, start=s, end=e)
    # Force class name to Spotify for isinstance-style detection.
    obj.__class__ = type("Spotify", (FakeSpotify,), {})
    return obj


def run_tests():
    NOW = 1_790_000_000_000
    cfg = {"aliases": {}, "ignore_apps": []}

    print("[TEST] listening never creates a game session...")
    sp.clear_all()
    m = _Member("u1", "Alice", [_spot("Song A", "t1", NOW, NOW + 180_000)])
    assert gt.extract_playing_activity(m, cfg) is None
    assert gt.handle_presence_update(GamingDatabase(":memory:"), None, m,
                                     now_ms=NOW, cfg=cfg) in ("IGNORED", "STOP")

    print("[TEST] song change updates entry immediately...")
    sp.clear_all()
    assert sp.handle_spotify_presence(None, m, now_ms=NOW) == "START"
    assert sp._SPOTIFY_LIVE["u1"]["title"] == "Song A"
    m2 = _Member("u1", "Alice", [_spot("Song B", "t2", NOW + 1000, NOW + 181_000)])
    assert sp.handle_spotify_presence(m, m2, now_ms=NOW + 1000) == "UPDATE"
    assert sp._SPOTIFY_LIVE["u1"]["title"] == "Song B"
    assert sp._SPOTIFY_LIVE["u1"]["track_id"] == "t2"

    print("[TEST] stop removes entry + offline removes...")
    m_stop = _Member("u1", "Alice", [])
    assert sp.handle_spotify_presence(m2, m_stop, now_ms=NOW + 2000) == "STOP"
    assert "u1" not in sp._SPOTIFY_LIVE
    sp.handle_spotify_presence(None, m, now_ms=NOW)
    m_off = _Member("u1", "Alice", [_spot("Song A", "t1")], status="offline")
    assert sp.handle_spotify_presence(m, m_off, now_ms=NOW + 3000) == "STOP"
    assert "u1" not in sp._SPOTIFY_LIVE

    print("[TEST] end + 15s TTL expiry...")
    sp.clear_all()
    sp.handle_spotify_presence(None, m, now_ms=NOW)
    assert len(sp._SPOTIFY_LIVE) == 1
    assert sp.prune_expired(now_ms=NOW + 100_000) == 0  # still playing
    assert sp.prune_expired(now_ms=NOW + 180_000 + 15_001) == 1
    assert len(sp._SPOTIFY_LIVE) == 0

    print("[TEST] opted-out user hidden (privacy + spotify tables)...")
    with tempfile.TemporaryDirectory() as tmp:
        db = GamingDatabase(os.path.join(tmp, "sp.db"))
        sp.clear_all()
        real_now = int(time.time() * 1000)
        guild = _Guild([_Member("u1", "Alice", [_spot("Song A", "t1", real_now, real_now + 180_000)]),
                        _Member("u2", "Bob", [_spot("Song C", "t3", real_now, real_now + 180_000)])])
        sp.rebuild_spotify([guild], now_ms=real_now)
        assert len(sp._SPOTIFY_LIVE) == 2
        router = PublicApiRouter(db)
        live = asyncio.run(router._build_spotify())
        assert live["total"] == 2, live
        assert {r["name"] for r in live["listeners"]} == {"Alice", "Bob"}
        blob = str(live)
        assert "u1" not in blob and "u2" not in blob, "IDs leaked"
        assert set(live) >= {"generated_at", "listeners", "total"}
        assert set(live["listeners"][0]) >= {"name", "avatar", "title", "artist",
                                             "album", "art", "track_url", "start", "end"}
        db.set_privacy_optout("u1", True)
        live2 = asyncio.run(router._build_spotify())
        assert live2["total"] == 1 and live2["listeners"][0]["name"] == "Bob", live2
        db.set_privacy_optout("u1", False)
        db.set_spotify_optout("u2", True)
        live3 = asyncio.run(router._build_spotify())
        assert live3["total"] == 1 and live3["listeners"][0]["name"] == "Alice", live3
        db.set_spotify_optout("u2", False)

    print("[TEST] SHOW_SPOTIFY=false blanks payload...")
    os.environ["NEXUS_SHOW_SPOTIFY"] = "false"
    try:
        assert sp.show_spotify_enabled() is False
        assert sp.get_spotify_live(now_ms=NOW) == []
    finally:
        os.environ.pop("NEXUS_SHOW_SPOTIFY", None)
    assert sp.show_spotify_enabled() is True

    print("[TEST] cap ~500 entries...")
    sp.clear_all()
    for i in range(505):
        sp.upsert_spotify(f"u{i}", {"name": f"N{i}", "title": "T",
                                     "artist": "A"}, now_ms=NOW + i)
    assert len(sp._SPOTIFY_LIVE) <= 500, len(sp._SPOTIFY_LIVE)

    print("[TEST] Spotify not in Most Played / game history...")
    with tempfile.TemporaryDirectory() as tmp:
        db = GamingDatabase(os.path.join(tmp, "sp2.db"))
        # Only Spotify presence -> no game sessions at all.
        assert gt.handle_presence_update(db, None, m, now_ms=NOW, cfg=cfg) == "IGNORED"
        assert db.get_open_game_sessions() == []
        mp = db.get_game_most_played(range_ms=7 * 86400 * 1000, limit=9, now_ms=NOW)
        assert mp == [], mp

    print("[TEST] scan rebuild syncs map...")
    sp.clear_all()
    real_now2 = int(time.time() * 1000)
    guild = _Guild([_Member("u9", "Zed", [_spot("Late Night", "t9", real_now2, real_now2 + 200_000)])])
    n = sp.rebuild_spotify([guild], now_ms=real_now2)
    assert n == 1 and sp._SPOTIFY_LIVE["u9"]["title"] == "Late Night"

    sp.clear_all()
    print("[TEST] ALL SPOTIFY TESTS PASSED [OK]")


if __name__ == "__main__":
    run_tests()
