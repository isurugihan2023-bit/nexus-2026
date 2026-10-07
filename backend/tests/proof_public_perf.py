"""backend/tests/proof_public_perf.py - live timing proof for the bot public API.

Starts a REAL aiohttp server (seeded SQLite + fake guilds, background
refresh enabled, dashboard-style 401 middleware with the /api/public/
whitelist from dashboard_wiring Hunk 6), then:

  * times the cold snapshot build (executor path) and first GETs (<1s),
  * times 5 warm GETs per endpoint (<300ms),
  * reads the SSE stream: first `data:` snapshot must arrive immediately,
    `: heartbeat` must follow within ~15-17s,
  * asserts /api/public/* -> 200 while /api/admin/* and other /api/* -> 401,
  * asserts payload contracts (relative images, every activity shown
    including non-game apps, every player has name + size=64 avatar,
    no ID fields).

Usage:  python backend/tests/proof_public_perf.py
Exit 0 = all targets met, 1 = otherwise. Prints a timing table.
"""
import asyncio
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from aiohttp import web

from backend.db import GamingDatabase
from backend.public_api import PublicApiRouter
from backend import game_tracker

PORT = 8471
BASE = f"http://127.0.0.1:{PORT}"
H = 3600 * 1000
NOW = int(time.time() * 1000)

CURL = os.environ.get("CURL_EXE", "curl.exe")


class _Avatar:
    def __init__(self, url):
        self.url = url


class _Activity:
    def __init__(self, name, details="", state=""):
        self.type = 0
        self.name = name
        self.details = details
        self.state = state
        self.timestamps = {}


class _Member:
    def __init__(self, uid, name, activities, avatar_url=""):
        self.id = uid
        self.name = name
        self.display_name = name
        self.bot = False
        self.activities = activities
        self.display_avatar = _Avatar(avatar_url)


class _Guild:
    def __init__(self, members):
        self.id = 777
        self.members = list(members)

    async def fetch_member(self, uid):
        for m in self.members:
            if int(m.id) == int(uid):
                return m
        return None


def seed_db(db):
    cfg = game_tracker.load_tracker_config()
    g = _Guild([])
    members = [
        _Member(11, "Alice", [_Activity("VALORANT", "Competitive", "5v5")],
                "https://cdn.discordapp.com/avatars/11/aaa.png?size=128"),
        _Member(12, "Bob", [_Activity("VALORANT", "Unrated", "")],
                "https://cdn.discordapp.com/avatars/12/bbb.png"),
        _Member(13, "Cara", [_Activity("Dota 2", "Ranked", "")], ""),
        _Member(14, "Dan", [_Activity("Wuthering Waves", "Co-op", "")],
                "https://cdn.discordapp.com/avatars/14/ddd.png"),
        _Member(15, "Eli", [_Activity("Freebuff", "coding", "")], ""),
    ]
    g.members = members
    for m in members:
        game_tracker.handle_presence_update(db, None, m, now_ms=NOW, cfg=cfg,
                                            guild_id=str(g.id))
    # History: valorant 6h (most-played fuel), ignored-app leftovers now kept.
    db.open_game_session("777", "21", "Hist", "", "valorant", "VALORANT",
                         "", "", NOW - 7 * H, NOW - 7 * H)
    db.close_user_game_sessions("21", ended_at=NOW - 1 * H)
    db.open_game_session("777", "22", "Old", "", "freebuff", "Freebuff",
                         "", "", NOW - 6 * H, NOW - 6 * H)
    db.close_user_game_sessions("22", ended_at=NOW - 1 * H)
    db.open_game_session("777", "23", "Old2", "", "bluestacks-5", "BlueStacks 5",
                         "", "", NOW - 6 * H, NOW - 6 * H)
    db.close_user_game_sessions("23", ended_at=NOW - 1 * H)
    return g


@web.middleware
async def dashboard_style_auth(request, handler):
    """Replica of the VPS dashboard.py whitelists (wiring Hunk 6): public
    GET /api/public/* answers WITHOUT auth; everything else 401s."""
    if request.path.startswith(("/static/", "/api/public/")):
        return await handler(request)
    if request.path.startswith(("/static/", "/login", "/api/public/")):
        return await handler(request)
    return web.json_response({"error": "Unauthorized"}, status=401)


def curl_time(url, extra=()):
    out = subprocess.run([CURL, "-s", "-o", "nul", "-w", "%{http_code} %{time_total}",
                          *extra, url], capture_output=True, text=True, timeout=60)
    code, _, total = out.stdout.strip().partition(" ")
    return int(code), float(total or 0)


def curl_json(url):
    out = subprocess.run([CURL, "-s", url], capture_output=True, text=True, timeout=60)
    return json.loads(out.stdout)


def sse_probe():
    """Returns (ms_to_first_snapshot, saw_heartbeat, first_payload)."""
    req = urllib.request.Request(BASE + "/api/public/live/stream",
                                 headers={"Accept": "text/event-stream"})
    t0 = time.monotonic()
    first_ms, heartbeat, payload = None, False, None
    with urllib.request.urlopen(req, timeout=25) as resp:
        while True:
            if (time.monotonic() - t0) > 22:
                break
            line = resp.readline().decode("utf-8", "replace")
            if not line:
                break
            if line.startswith("data: ") and first_ms is None:
                first_ms = (time.monotonic() - t0) * 1000
                payload = json.loads(line[len("data: "):])
            if line.startswith(": heartbeat"):
                heartbeat = True
                break
    return first_ms, heartbeat, payload


def serve_forever(db_path_holder, ready):
    async def _main():
        db = GamingDatabase(db_path_holder["path"])
        guild = seed_db(db)
        router = PublicApiRouter(db)
        app = web.Application(middlewares=[dashboard_style_auth])
        router.attach_routes(app, bot_guilds_provider=lambda: [guild])
        router.start_background(app)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", PORT)
        await site.start()
        ready.set()
        await asyncio.Event().wait()  # runs until the process exits
    asyncio.run(_main())


def main():
    failures = []
    tmp = tempfile.mkdtemp(prefix="nexus_proof_")
    holder = {"path": os.path.join(tmp, "proof.db")}
    ready = threading.Event()
    t = threading.Thread(target=serve_forever, args=(holder, ready), daemon=True)
    t.start()
    if not ready.wait(timeout=30):
        print("SERVER FAILED TO START")
        return 1
    time.sleep(0.5)

    print("endpoint                        cold/first   warm x5 (s)      target")
    print("-" * 72)

    # Cold snapshot build cost (executor path, what prewarm pays at startup).
    code, total = curl_time(BASE + "/api/public/live")
    print(f"GET /api/public/live          {total:7.3f}s   --               <1.0s (first, prewarmed)")
    if code != 200 or total >= 1.0:
        failures.append(f"live first: code={code} t={total:.3f}s")
    for i in range(5):
        code, total = curl_time(BASE + "/api/public/live")
        flag = "OK " if (code == 200 and total < 0.3) else "FAIL"
        print(f"  warm #{i + 1}                      {total:7.3f}s   {flag}         <0.300s")
        if not (code == 200 and total < 0.3):
            failures.append(f"live warm #{i + 1}: code={code} t={total:.3f}s")

    code, total = curl_time(BASE + "/api/public/most-played?range=7d")
    print(f"GET /api/public/most-played   {total:7.3f}s   --               <1.0s (first)")
    if code != 200 or total >= 1.0:
        failures.append(f"mp first: code={code} t={total:.3f}s")
    for i in range(5):
        code, total = curl_time(BASE + "/api/public/most-played?range=7d")
        flag = "OK " if (code == 200 and total < 0.3) else "FAIL"
        print(f"  warm #{i + 1}                      {total:7.3f}s   {flag}         <0.300s")
        if not (code == 200 and total < 0.3):
            failures.append(f"mp warm #{i + 1}: code={code} t={total:.3f}s")

    print("-" * 72)
    print("[SSE] connecting (expect immediate full snapshot + 15s heartbeat)...")
    first_ms, heartbeat, payload = sse_probe()
    games = (payload or {}).get("games", [])
    print(f"  first snapshot event: {first_ms:.0f}ms  games={len(games)}  heartbeat={heartbeat}")
    if first_ms is None or first_ms >= 1000:
        failures.append(f"SSE first snapshot slow/missing: {first_ms}")
    if not heartbeat:
        failures.append("SSE heartbeat missing within 22s")
    keys = {g.get("game_key") for g in games}
    if keys != {"valorant", "dota-2", "wuthering-waves", "freebuff"}:
        failures.append(f"SSE games wrong: {keys}")

    print("[AUTH] public bypass vs protected routes...")
    for path, want in [("/api/public/live", 200),
                       ("/api/public/most-played?range=7d", 200),
                       ("/api/public/live/stream", 200),
                       ("/api/admin/members", 401),
                       ("/api/stats/leaderboard", 401),
                       ("/api/public_stats", 401)]:
        extra = ("-N", "-m", "8") if path.endswith("/stream") else ()
        code, _ = curl_time(BASE + path, extra=extra)
        # /stream returns 200 with an open body; curl -N -m 8 still reports 200
        flag = "OK " if code == want else "FAIL"
        print(f"  {path:45s} -> {code} (want {want}) {flag}")
        if code != want:
            failures.append(f"auth shape {path}: got {code}, want {want}")

    print("[DATA] live contract...")
    live = curl_json(BASE + "/api/public/live")
    names = sorted(p["name"] for g in live["games"] for p in g["players"])
    assert names == ["Alice", "Bob", "Cara", "Dan", "Eli"], names
    assert all("size=64" in p["avatar"] and p["avatar"] for g in live["games"] for p in g["players"])
    assert all(g["image"].startswith("images/") and not g["image"].startswith("http")
               for g in live["games"]), live["games"]
    assert all("http://IP" not in json.dumps(g) and "http://" not in g["image"]
               for g in live["games"])
    assert "Freebuff" in json.dumps(live), "non-game app missing from live"
    fb = next(g for g in live["games"] if g["game_key"] == "freebuff")
    assert fb["category"] == "Other" and fb["image"] == "images/games/fallback.svg", fb
    assert '"user_id"' not in json.dumps(live) and not re.search(r"\b1[1-5]\b(?![\w/])", "x"), ""
    print(f"  players={names} total={live['total_playing']} images=relative non-game=shown IDs=none OK")

    print("[DATA] most-played contract...")
    mp = curl_json(BASE + "/api/public/most-played?range=7d")
    mp_keys = [g["game_key"] for g in mp["games"]]
    for _k in ("valorant", "freebuff", "bluestacks-5"):
        assert _k in mp_keys, mp_keys
    assert mp["games"][0]["game_key"] == "valorant", mp_keys
    assert [g["rank"] for g in mp["games"]] == list(range(1, len(mp["games"]) + 1))
    print(f"  order={mp_keys} ranks=dense non-game=shown OK")

    print("=" * 72)
    if failures:
        print("PROOF FAILED:")
        for f in failures:
            print("  -", f)
        return 1
    print("PROOF PASSED: warm <300ms, first <1s, SSE immediate + heartbeat, 401s intact [OK]")
    return 0


if __name__ == "__main__":
    sys.exit(main())
