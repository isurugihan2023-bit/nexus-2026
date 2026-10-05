"""Ad-hoc cold-path checks: snapshot build cost, FiveM keep-previous + TTL
clamp, artwork relative/https rules. Run from the repo root."""
import asyncio
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.abspath(os.path.dirname(__file__) + "/../.."))

import types as _t

_aiohttp = _t.ModuleType("aiohttp")
_web = _t.ModuleType("aiohttp.web")


class _R:
    def __init__(self, *a, **k):
        self.status = k.get("status", 200)
        self.headers = {}


_web.Response = _R
_web.StreamResponse = _R
_web.Application = object
_web.Request = object
_web.json_response = lambda *a, **k: _R(status=k.get("status", 200))
_aiohttp.web = _web
sys.modules.setdefault("aiohttp", _aiohttp)
sys.modules.setdefault("aiohttp.web", _web)

from backend.db import GamingDatabase
from backend.public_api import PublicApiRouter
import backend.fivem as fivem
import backend.artwork as artwork

H = 3600 * 1000
NOW = int(time.time() * 1000)

with tempfile.TemporaryDirectory() as tmp:
    db = GamingDatabase(os.path.join(tmp, "cold.db"))
    db.open_game_session("g", "u1", "Alice", "", "valorant", "VALORANT",
                         "Comp", "", NOW - 2 * H, NOW - 2 * H)
    db.open_game_session("g", "u2", "Bob", "", "dota-2", "Dota 2",
                         "", "", NOW - H, NOW - H)
    router = PublicApiRouter(db)
    t0 = time.monotonic()
    live = asyncio.run(router._snapshot_live())
    build_ms = (time.monotonic() - t0) * 1000
    print(f"cold _snapshot_live build: {build_ms:.1f}ms "
          f"(games={len(live['games'])}, total={live['total_playing']})")
    assert build_ms < 1000, "cold build over budget"
    assert live["total_playing"] == 2

    # FiveM: good value cached, then outage keeps previous; TTL clamps 15-30.
    fivem._cache = {"at": time.monotonic(), "value": {"current": 12, "max": 64}}
    got = fivem.fetch_player_count_sync("203.0.113.9:30120")  # unroutable
    assert got == {"current": 12, "max": 64}, got
    print("fivem keep-previous on outage: OK", got)
    assert fivem.MIN_CACHE_SECONDS == 15 and fivem.MAX_CACHE_SECONDS == 30
    os.environ["NEXUS_FIVEM_CACHE_SECONDS"] = "999"
    assert fivem.cache_seconds() == 30
    os.environ["NEXUS_FIVEM_CACHE_SECONDS"] = "1"
    assert fivem.cache_seconds() == 15
    del os.environ["NEXUS_FIVEM_CACHE_SECONDS"]
    print("fivem TTL clamp [15,30]: OK")

    # Artwork: relative only; http:// base upgraded to https.
    rel = artwork.relative_image_for("valorant", "Tactical FPS")
    assert rel.startswith("images/") and "http" not in rel, rel
    rel2 = artwork.relative_image_for("freebuff", "Gaming")
    assert rel2 == "images/games/fallback.svg", rel2
    os.environ["NEXUS_PUBLIC_BASE"] = "http://1.2.3.4:30038"
    try:
        assert artwork._public_base() == "https://1.2.3.4:30038"
        # Absolute branch (bot host without the website tree): simulate a
        # category whose file is absent locally.
        artwork.CATEGORY_SVGS["__testcat__"] = "cat-does-not-exist.svg"
        try:
            cat = artwork.category_image("__TestCat__")
        finally:
            del artwork.CATEGORY_SVGS["__testcat__"]
        assert cat.startswith("https://") and "http://" not in cat, cat
    finally:
        del os.environ["NEXUS_PUBLIC_BASE"]
    print("artwork relative + https-upgrade: OK", rel, "|", rel2)
print("COLD-PATH CHECKS PASSED [OK]")
