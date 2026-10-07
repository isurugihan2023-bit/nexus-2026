"""backend/tests/test_public_refresh.py - background snapshots, keep-all
activities, member resolution and relative-image contracts.

Simulates Discord presence (fake members/guilds, no network): presence
updates -> game_sessions -> public payloads, verifying that EVERY Playing /
Competing activity shows (games AND non-game apps like Freebuff/BlueStacks),
every live player keeps a display name + size=64 avatar, fetch_member runs at
most once per member, and no absolute artwork URL is ever emitted. Only bots,
Spotify/Listening, Watching, Custom Status and opted-out members are out.
"""
import asyncio
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import types as _types

# ── minimal aiohttp stub (payload-level tests only) ──
_aiohttp = _types.ModuleType("aiohttp")
_web = _types.ModuleType("aiohttp.web")


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
        self.on_startup = []
        self.on_cleanup = []

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
import game_tracker


# ── discord fakes ──
class _Avatar:
    def __init__(self, url):
        self.url = url


class _Activity:
    def __init__(self, name, details="", state="", start=None, type_=0):
        self.type = type_  # 0 = playing
        self.name = name
        self.details = details
        self.state = state
        self.timestamps = {"start": start} if start else {}


class _Member:
    def __init__(self, uid, name, activities, avatar_url="", guild=None, bot=False):
        self.id = uid
        self.name = name
        self.display_name = name
        self.bot = bot
        self.activities = activities
        self.display_avatar = _Avatar(avatar_url)
        self.guild = guild


class _Guild:
    def __init__(self, members):
        self.id = 999
        self.members = list(members)
        self.fetch_calls = []

    async def fetch_member(self, uid):
        self.fetch_calls.append(int(uid))
        for m in self.members:
            if int(m.id) == int(uid):
                return m
        # unknown member: minimal object, no avatar -> default avatar path
        return _Member(uid, "Ghost", [], avatar_url="")


NOW_MS = 1_790_000_000_000


def _presence(db, cfg, guild, member, start_ms):
    return game_tracker.handle_presence_update(
        db, None, member, now_ms=start_ms, cfg=cfg, guild_id=str(guild.id))


def run_tests():
    with tempfile.TemporaryDirectory() as tmp:
        db = GamingDatabase(os.path.join(tmp, "refresh.db"))
        cfg = game_tracker.load_tracker_config()

        guild = _Guild([])
        alice = _Member(101, "Alice", [_Activity("VALORANT", "Competitive", "5v5")],
                        "https://cdn.discordapp.com/avatars/101/aaa.png?size=128", guild)
        bob = _Member(102, "Bob", [_Activity("Freebuff", "coding", "")], "", guild)
        cara = _Member(103, "Cara", [_Activity("BlueStacks 5", "Clash")],
                        "https://cdn.discordapp.com/avatars/103/ccc.png", guild)
        dan = _Member(104, "Dan", [_Activity("Dota 2", "Ranked", "")], "", guild)
        botty = _Member(105, "Botty", [_Activity("VALORANT")], "", guild, bot=True)
        spoty = _Member(106, "Spoty", [_Activity("Spotify", "", "", type_="listening")],
                        "", guild)
        guild.members = [alice, bob, cara, dan, botty, spoty]

        print("[TEST] simulated presence: games AND non-game apps tracked...")
        assert _presence(db, cfg, guild, alice, NOW_MS) == "START"
        assert _presence(db, cfg, guild, bob, NOW_MS) == "START"    # Freebuff shows
        assert _presence(db, cfg, guild, cara, NOW_MS) == "START"  # BlueStacks shows
        assert _presence(db, cfg, guild, dan, NOW_MS) == "START"
        assert _presence(db, cfg, guild, botty, NOW_MS) == "IGNORED"
        assert _presence(db, cfg, guild, spoty, NOW_MS) == "IGNORED"

        print("[TEST] shipped config ignores editors (exact), games untouched...")
        assert game_tracker.should_ignore("Freebuff", cfg) is False
        assert game_tracker.should_ignore("BlueStacks 5", cfg) is False
        assert game_tracker.should_ignore("Code", cfg) is True
        assert game_tracker.should_ignore("Visual Studio Code", cfg) is True
        assert game_tracker.should_ignore("Code Vein", cfg) is False
        assert game_tracker.should_ignore("Spotify", cfg) is True
        assert game_tracker.should_ignore("Custom Status", cfg) is True

        print("[TEST] 'Code' never aliases to a real game...")
        assert game_tracker.normalize_game("Code", "Not in a file!", "", cfg) == ("code", "Code")
        assert game_tracker.normalize_game("Code Vein", "", "", cfg) == ("code-vein", "Code Vein")
        assert game_tracker.normalize_game("CoD", "", "", cfg) == ("call-of-duty", "Call of Duty")

        router = PublicApiRouter(db)
        router._guilds_provider = lambda: [guild]

        print("[TEST] live payload: every activity present, players complete...")
        live = asyncio.run(router._build_live())
        keys = {g["game_key"] for g in live["games"]}
        assert keys == {"valorant", "freebuff", "bluestacks-5", "dota-2"}, keys
        assert live["total_playing"] == 4, live
        for g in live["games"]:
            assert g["game_key"] and g["category"], g
            assert g["image"].startswith("images/") and not g["image"].startswith("http"), g
            assert g["fallback"].startswith("images/"), g
            for p in g["players"]:
                assert p["name"] and p["name"] != "", p
                assert "size=64" in p["avatar"], p
        blob = str(live)
        assert "Freebuff" in blob and "BlueStacks 5" in blob, blob
        import re as _re
        scrubbed = _re.sub(r"https://\S+?\.png\S*?(?=['\", ])", "", blob)
        assert '"user_id"' not in scrubbed and '"player_id"' not in scrubbed
        for _uid in ("101", "102", "103", "104"):
            assert _re.search(rf"(?<![\w/]){_uid}(?![\w])", scrubbed) is None, \
                f"raw member id {_uid} leaked: {scrubbed[:300]}"

        print("[TEST] unknown category is 'Other' with clean fallback art...")
        fb = next(g for g in live["games"] if g["game_key"] == "freebuff")
        assert fb["category"] == "Other", fb
        assert fb["image"] == "images/games/fallback.svg", fb
        assert fb["players"][0]["name"] == "Bob", fb
        assert "embed/avatars/0.png?size=64" in fb["players"][0]["avatar"], fb
        val = next(g for g in live["games"] if g["game_key"] == "valorant")
        assert "aaa.png?size=64" in val["players"][0]["avatar"], val
        assert val["players"][0]["details"] == "Competitive", val

        print("[TEST] most-played ranks every activity, none hidden...")
        mp = asyncio.run(router._build_most_played(7 * 86400 * 1000, "7d"))
        mp_keys = [g["game_key"] for g in mp["games"]]
        for _k in ("valorant", "dota-2", "freebuff", "bluestacks-5"):
            assert _k in mp_keys, mp_keys
        assert [g["rank"] for g in mp["games"]] == list(range(1, len(mp["games"]) + 1)), mp
        assert all(g["image"].startswith("images/") for g in mp["games"]), mp

        print("[TEST] fetch_member runs once per unknown member, then cached...")
        for _uid in ("101", "102", "103", "104"):
            db.close_user_game_sessions(_uid, ended_at=NOW_MS + 1000)
        ghost_guild = _Guild([])
        router2 = PublicApiRouter(db)
        router2._guilds_provider = lambda: [ghost_guild]
        db.open_game_session("999", "301", "", "", "valorant", "VALORANT",
                             "", "", NOW_MS, NOW_MS)
        asyncio.run(router2._build_live())
        asyncio.run(router2._build_live())
        assert ghost_guild.fetch_calls == [301], ghost_guild.fetch_calls
        db.close_user_game_sessions("301", ended_at=NOW_MS + 1000)

        print("[TEST] snapshot serving: requests serve bytes, no recompute...")
        router._store_snap(router._live_snap, live)
        assert router._live_snap["body"].startswith(b'{"generated_at"')
        assert router._live_snap["version"] == 1
        router._store_snap(router._live_snap, live)
        assert router._live_snap["version"] == 2

        print("[TEST] ALL PUBLIC REFRESH TESTS PASSED [OK]")


if __name__ == "__main__":
    run_tests()
