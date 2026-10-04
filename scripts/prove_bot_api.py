"""scripts/prove_bot_api.py - End-to-end proof for the VPS bot public API.

Runs TWO real aiohttp apps locally (no Discord token needed; guilds/members
are duck-typed stubs, exactly what game_tracker consumes):
  BROKEN 127.0.0.1:8472 - auth middleware WITHOUT the /api/public/ bypass.
      Replicates production today: GET /api/public/live -> 401.
  FIXED  127.0.0.1:8471 - same app WITH the bypass (the dashboard.py patch).
      Proves: live 200, most-played 200, admin still 401/403, presence
      start/switch/stop changing the JSON, CORS, ETag/304, rate-limit 429,
      SSE first event, privacy (no IDs, size=64, opt-outs).

All HTTP is done with real curl.exe subprocess calls. Exits 0 on full pass.
Usage: python scripts/prove_bot_api.py
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

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from aiohttp import web  # noqa: E402

from backend.db import GamingDatabase  # noqa: E402
from backend import game_tracker  # noqa: E402
from backend.public_api import PublicApiRouter  # noqa: E402
from backend.dashboard_wiring import rebuild_game_sessions  # noqa: E402

HOST, FIXED_PORT, BROKEN_PORT = "127.0.0.1", 8471, 8472
PASS, FAIL = "PASS", "FAIL"
results, bodies = [], []


def check(name, cond, detail=""):
    results.append(cond)
    print(f"[{PASS if cond else FAIL}] {name}" + (f" -- {detail}" if detail else ""))
    if not cond:
        print("      FAILED CONDITION, aborting proof.")
        raise SystemExit(1)


def curl(args, timeout=15):
    p = subprocess.run(["curl.exe", "-s", "--max-time", str(timeout)] + args,
                       capture_output=True, text=True)
    return p.stdout


def get(url, headers=None, timeout=15):
    h = []
    for k, v in (headers or {}).items():
        h += ["-H", f"{k}: {v}"]
    out = curl(["-i"] + h + [url], timeout)
    head, _, body = out.partition("\r\n\r\n")
    if "\r\n\r\n" not in out:
        head, _, body = out.partition("\n\n")
    status = head.splitlines()[0] if head else ""
    return status, head, body.strip()


# ── duck-typed Discord stubs (game_tracker never imports discord) ──
class FakeAct:
    def __init__(self, name, atype=0, details="", state=""):
        self.name, self.type, self.details, self.state = name, atype, details, state
        self.timestamps = {}


class FakeAvatar:
    url = "https://cdn.discordapp.com/avatars/111222333444555666/aaaa.png?size=128"


class FakeMember:
    def __init__(self, uid, name, acts, bot=False):
        self.id, self.name, self.display_name = uid, name, name
        self.bot, self.activities, self.display_avatar = bot, acts, FakeAvatar()


class FakeGuild:
    def __init__(self, gid, members):
        self.id, self.members = gid, members


# ── middleware replicas: BROKEN (today) vs FIXED (the patch) ──
def make_middlewares(public_bypass: bool):
    @web.middleware
    async def api_auth_middleware(request, handler):
        prefixes = ("/static/", "/api/public/") if public_bypass else ("/static/",)
        if request.path.startswith(prefixes):
            return await handler(request)
        if request.path.startswith("/api/"):
            return web.json_response({"error": "Unauthorized"}, status=401)
        return await handler(request)

    @web.middleware
    async def page_auth_middleware(request, handler):
        prefixes = ("/static/", "/login", "/api/public/") if public_bypass else ("/static/", "/login")
        if request.path.startswith(prefixes):
            return await handler(request)
        if request.path.startswith(("/admin", "/dashboard")):
            return web.json_response({"error": "Forbidden"}, status=403)
        return await handler(request)

    return [api_auth_middleware, page_auth_middleware]


def build_app(db, public_bypass: bool):
    router = PublicApiRouter(db)
    app = web.Application(middlewares=make_middlewares(public_bypass))

    async def admin_test(request):
        return web.json_response({"secret": "must-never-leak"})

    async def admin_page(request):
        return web.Response(text="<html>admin</html>", content_type="text/html")

    app.router.add_get("/api/admin/test", admin_test)
    app.router.add_get("/admin", admin_page)
    router.attach_routes(app)
    return app, router


def serve(app, port):
    loop = asyncio.new_event_loop()
    holder = {}

    async def _start():
        runner = web.AppRunner(app)
        await runner.setup()
        await web.TCPSite(runner, HOST, port).start()
        holder["runner"] = runner

    def _run():
        asyncio.set_event_loop(loop)
        loop.run_until_complete(_start())
        loop.run_forever()

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return t


def main():
    tmp = tempfile.mkdtemp(prefix="nexus_proof_")
    db = GamingDatabase(os.path.join(tmp, "proof.db"))
    cfg = game_tracker.load_tracker_config()
    now = int(time.time() * 1000)
    H = 3600 * 1000

    alice = FakeMember("u-alice", "Alice", [FakeAct("VALORANT", 0, "Competitive Match")])
    cara = FakeMember("u-cara", "Cara", [FakeAct("Minecraft", 0, "Survival")])
    guilds = [FakeGuild("g1", [alice, cara])]

    print("== boot rebuild (orphans closed, live set scanned, >30d pruned) ==")
    rep = rebuild_game_sessions(guilds, db, cfg, now_ms=now - 2 * H)
    # Backdate Alice's VALORANT start so most-played shows real hours.
    db.close_user_game_sessions("u-alice", ended_at=now - 2 * H)
    db.open_game_session("g1", "u-alice", "Alice", FakeAvatar.url,
                         "valorant", "VALORANT", "Competitive Match", "",
                         started_at=now - 2 * H, now_ms=now - 2 * H)
    print(f"   rebuild={rep} (+ Alice VALORANT backdated 2h)")

    broken_app, _ = build_app(db, public_bypass=False)
    fixed_app, fixed_router = build_app(db, public_bypass=True)
    serve(broken_app, BROKEN_PORT)
    serve(fixed_app, FIXED_PORT)
    time.sleep(1.5)

    print("\n== 1. production symptom: no bypass -> 401 Unauthorized ==")
    s, _, b = get(f"http://{HOST}:{BROKEN_PORT}/api/public/live")
    bodies.append(b)
    print(f"   curl /api/public/live -> {s} {b}")
    check("broken app answers 401 like production", "401" in s and "Unauthorized" in b)

    print("\n== 2. fixed app: live 200 ==")
    s, h, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    bodies.append(b)
    data = json.loads(b)
    print("   " + json.dumps(data, indent=1)[:900])
    check("live 200 with games array", "200" in s and isinstance(data.get("games"), list))
    check("boot member present (Alice/VALORANT)", any(g["name"] == "VALORANT" for g in data["games"]))
    check("opt-out Cara present before opt-out", any(
        p["name"] == "Cara" for g in data["games"] for p in g["players"]))

    print("\n== 3. presence START (Bob -> Dota 2) ==")
    bob_off = FakeMember("u-bob", "Bob", [])
    bob_on = FakeMember("u-bob", "Bob", [FakeAct("Dota 2", 0, "Ranked Match")])
    a = game_tracker.handle_presence_update(db, bob_off, bob_on, now_ms=now + 1, cfg=cfg, guild_id="g1")
    fixed_router.invalidate_live()  # wiring Hunk 5 does this on every event
    print(f"   handler action: {a}")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    bodies.append(b)
    data = json.loads(b)
    check("START returns START", a == "START")
    check("Dota 2 appears in live JSON", any(g["name"] == "Dota 2" for g in data["games"]),
          f"games={[g['name'] for g in data['games']]}")

    print("\n== 4. presence SWITCH (Alice VALORANT -> Ceylon Roleplay) ==")
    al_before = FakeMember("u-alice", "Alice", [FakeAct("VALORANT", 0, "Competitive Match")])
    al_after = FakeMember("u-alice", "Alice",
                          [FakeAct("FiveM", 0, "Players 50/100 Ceylon RP", "Ceylon RP")])
    a = game_tracker.handle_presence_update(db, al_before, al_after, now_ms=now + 2, cfg=cfg, guild_id="g1")
    fixed_router.invalidate_live()
    print(f"   handler action: {a}")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    bodies.append(b)
    data = json.loads(b)
    names = [g["name"] for g in data["games"]]
    check("SWITCH returns SWITCH", a == "SWITCH")
    check("VALORANT gone, Ceylon Roleplay present", "Ceylon Roleplay" in names and "VALORANT" not in names,
          f"games={names}")

    print("\n== 5. presence STOP (Bob leaves) ==")
    a = game_tracker.handle_presence_update(db, bob_on, bob_off, now_ms=now + 3, cfg=cfg, guild_id="g1")
    fixed_router.invalidate_live()
    print(f"   handler action: {a}")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    bodies.append(b)
    data = json.loads(b)
    names = [g["name"] for g in data["games"]]
    check("STOP returns STOP", a == "STOP")
    check("Dota 2 disappears from live JSON", "Dota 2" not in names, f"games={names}")

    print("\n== 6. privacy opt-out (Cara) honored ==")
    db.set_privacy_optout("u-cara", True)
    fixed_router.invalidate_live()  # opt-out commands must do this (see wiring Hunk 8)
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    bodies.append(b)
    data = json.loads(b)
    check("opted-out member excluded", not any(
        p["name"] == "Cara" for g in data["games"] for p in g["players"]),
        f"games={[(g['name'], [p['name'] for p in g['players']]) for g in data['games']]}")

    print("\n== 7. most-played grouped BY GAME ==")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/public/most-played?range=7d")
    bodies.append(b)
    mp = json.loads(b)
    print("   " + json.dumps([(g["name"], g["unique_players"], g["total_hours"]) for g in mp["games"]]))
    check("most-played 200", "200" in s and bool(mp["games"]))
    check("VALORANT first with ~2h", mp["games"][0]["name"] == "VALORANT"
          and abs(mp["games"][0]["total_hours"] - 2.0) < 0.2, str(mp["games"][0]))

    print("\n== 8. admin still protected ==")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/api/admin/test")
    check("/api/admin/* still 401", "401" in s and "secret" not in b, f"{s} {b}")
    s, _, b = get(f"http://{HOST}:{FIXED_PORT}/admin")
    check("/admin page still 403", "403" in s, s)

    print("\n== 9. CORS allow-list ==")
    s, h, _ = get(f"http://{HOST}:{FIXED_PORT}/api/public/live",
                  {"Origin": "https://ninjanexus.duckdns.org"})
    check("allowed origin echoed", "access-control-allow-origin: https://ninjanexus.duckdns.org" in h.lower())
    s, h, _ = get(f"http://{HOST}:{FIXED_PORT}/api/public/live",
                  {"Origin": "https://evil.example"})
    check("unlisted origin gets no ACAO (browser blocks)", "access-control-allow-origin" not in h.lower())

    print("\n== 10. ETag / 304 ==")
    s, h, _ = get(f"http://{HOST}:{FIXED_PORT}/api/public/live")
    m = re.search(r"etag:\s*(\S+)", h, re.I)
    check("ETag present", bool(m))
    etag = m.group(1) if m else ""
    s2, _, b2 = get(f"http://{HOST}:{FIXED_PORT}/api/public/live", {"If-None-Match": etag})
    check("If-None-Match -> 304 empty", "304" in s2 and b2 == "", s2)

    print("\n== 11. rate limit (fresh XFF bucket, default 120/min) ==")
    codes = []
    for _ in range(125):
        s, _, _ = get(f"http://{HOST}:{FIXED_PORT}/api/public/live",
                      {"X-Forwarded-For": "9.9.9.9"})
        codes.append("200" in s)
    n_ok, n_lim = sum(codes), len(codes) - sum(codes)
    check("120 pass then 429s", n_ok == 120 and n_lim == 5, f"200x{n_ok} 429x{n_lim}")

    print("\n== 12. SSE stream first event ==")
    out = curl(["-N", "--max-time", "6", f"http://{HOST}:{FIXED_PORT}/api/public/live/stream"])
    first = next((ln for ln in out.splitlines() if ln.startswith("data: ")), "")
    print(f"   {first[:160]}...")
    check("SSE pushes live payload", first.startswith("data: ") and '"games"' in first)

    print("\n== 13. privacy: no raw IDs, avatars size=64 ==")
    blob = "\n".join(bodies)
    # Avatar URLs legitimately embed an ID in their path (public CDN URLs are
    # the allowed shape); strip URLs, then no raw ID may remain as data.
    blob_nourls = re.sub(r"https?://\S+", "", blob)
    check("no ID fields leaked", not re.search(r'"(user_id|player_id|discord_user_id)"', blob))
    check("no 15+ digit IDs outside URLs", not re.search(r"\b\d{15,25}\b", blob_nourls))
    check("avatars carry size=64", "size=64" in blob)

    print(f"\nALL BOT API PROOF CHECKS PASSED [{sum(results)}/{len(results)}]")


if __name__ == "__main__":
    main()
