"""Screenshot capture round 2 — fix tab activation via showTab(), regex API stubs."""
import re, json, threading, functools, pathlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

SRC = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
WORK = pathlib.Path(r"C:\Users\isuru\AppData\Local\Temp\opencode\nexus_audit_copy")
SHOTS = SRC / ".phase1_audit_site" / "shots_before"
assert WORK.exists(), "copy missing"

Handler = functools.partial(SimpleHTTPRequestHandler, directory=str(WORK))
httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}/index.html"
print("serving copy at", base)

from playwright.sync_api import sync_playwright

STUB_GAMES = [
    {"name": "VALORANT", "count": 2,
     "players": ["Animo", "SL_LIDDA"],
     "player_details": [
        {"name": "Animo", "username": "4nimo.", "avatar": "https://cdn.discordapp.com/embed/avatars/0.png",
         "details": "Competitive Match", "state": "", "rich_cover": None, "start_timestamp": 1789735569000},
        {"name": "SL_LIDDA", "username": "sl_lidda", "avatar": "https://cdn.discordapp.com/embed/avatars/1.png",
         "details": "Competitive Match", "state": "", "rich_cover": None, "start_timestamp": 1789736471000}],
     "rich_cover": None, "sample_detail": "Competitive Match"},
    {"name": "PUBG: BATTLEGROUNDS", "count": 1,
     "players": ["local leclerc"],
     "player_details": [
        {"name": "local leclerc", "username": "leda6605", "avatar": "https://cdn.discordapp.com/embed/avatars/2.png",
         "details": "Normal, Erangel - 2 Squad", "state": "2 Squad", "rich_cover": None, "start_timestamp": 1789741522000}],
     "rich_cover": None, "sample_detail": "Normal, Erangel - 2 Squad"},
]
STUB_STATS = {"uptime": "11h 58m 20s", "uptime_seconds": 43100, "total_users": 48,
              "ninja_nexus_members": 48, "online_users": 12, "total_servers": 1,
              "total_commands": 150, "ping": 106, "top_played_games": STUB_GAMES,
              "playing_games": STUB_GAMES}
STUB_MOST = [{"game_name": "PUBG: BATTLEGROUNDS", "total_hours": "48.5", "unique_players": 6},
             {"game_name": "Brawlhalla", "total_hours": "32.1", "unique_players": 4},
             {"game_name": "ARC Raiders", "total_hours": "19.8", "unique_players": 3}]

def stub_routes(page):
    page.route(re.compile(r"/api/"), lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"games": STUB_MOST} if "most-played" in r.request.url else STUB_STATS)))
    page.route(re.compile(r"discord\.com/api"), lambda r: r.fulfill(
        status=200, content_type="application/json", body='{"approximate_member_count": 48}'))
    for pat in ["unsplash", "igdb", "steamcdn", "discordapp"]:
        page.route(re.compile(pat), lambda r: r.abort())
    page.route(re.compile(r"live-games|websocket|wss?:"), lambda r: r.abort())

def show(page, tab):
    page.evaluate(f"showTab({tab!r})")
    page.wait_for_timeout(1200)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    pg = browser.new_page(viewport={"width": 1440, "height": 900})
    stub_routes(pg)
    pg.goto(base)
    pg.wait_for_timeout(2500)
    # verify stub games rendered
    n = pg.evaluate("document.querySelectorAll('#live-games-grid .game-card').length")
    print("live game cards after load:", n)
    show(pg, "lounge")
    pg.wait_for_timeout(1500)
    n = pg.evaluate("document.querySelectorAll('#live-games-grid .game-card').length")
    print("live game cards in lounge:", n)
    pg.screenshot(path=str(SHOTS / "section_lounge_populated_1440.png"), full_page=True)
    # most played
    pg.eval_on_selector('.lounge-tab-btn[data-lounge-tab="most-played"]', "b => b.click()")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=str(SHOTS / "section_lounge_mostplayed_1440.png"), full_page=True)
    pg.eval_on_selector('.lounge-tab-btn[data-lounge-tab="live"]', "b => b.click()")
    pg.wait_for_timeout(800)
    # game modal
    try:
        pg.eval_on_selector("#live-games-grid .game-card", "c => c.click()")
        pg.wait_for_timeout(800)
        pg.screenshot(path=str(SHOTS / "section_game_modal_1440.png"))
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(400)
        print("game modal shot OK")
    except Exception as e:
        print("game modal shot failed:", e)
    # commands + active tab (force visible click)
    show(pg, "commands")
    pg.eval_on_selector('.cmd-filter[data-filter="ai"]', "b => b.click()")
    pg.wait_for_timeout(700)
    pg.screenshot(path=str(SHOTS / "state_command_tab_active.png"))
    print("cmd active shot OK")
    show(pg, "commands")
    pg.screenshot(path=str(SHOTS / "section_commands_1440.png"), full_page=True)
    # teamspeak modal + copied state
    show(pg, "home-cta")
    pg.eval_on_selector("#cta-ts-connect-btn", "b => b.click()")
    pg.wait_for_timeout(700)
    pg.screenshot(path=str(SHOTS / "section_teamspeak_card_1440.png"))
    pg.eval_on_selector("#ts-copy-btn", "b => b.click()")
    pg.wait_for_timeout(600)
    copied = pg.evaluate("document.getElementById('ts-copy-btn').className")
    print("copy btn class:", copied)
    pg.screenshot(path=str(SHOTS / "state_teamspeak_copied.png"))
    pg.keyboard.press("Escape")
    pg.wait_for_timeout(300)
    # re-take per-section shots with correct tabs
    for tab, name in [("lounge", "section_lounge_empty_check.png"), ("about", "section_about_1440.png"),
                      ("features", "section_features_1440.png"), ("stats", "section_stats_1440.png"),
                      ("home-cta", "section_cta_1440.png"), ("home", "full_1440x900_home.png")]:
        show(pg, tab)
        pg.screenshot(path=str(SHOTS / name), full_page=True)
    # empty lounge state: force empty render
    show(pg, "lounge")
    pg.evaluate("renderLiveGames([])")
    pg.wait_for_timeout(600)
    pg.screenshot(path=str(SHOTS / "section_lounge_empty_1440.png"), full_page=True)
    print("empty lounge shot OK")
    pg.close()
    browser.close()

httpd.shutdown()
print("round2 done")
for f in sorted(SHOTS.glob("*.png")):
    print(" ", f.name, f.stat().st_size)
