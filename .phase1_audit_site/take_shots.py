"""Screenshot capture — serves a COPY in temp, stubs backend, never touches project."""
import shutil, threading, functools, pathlib, json, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

SRC = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
WORK = pathlib.Path(r"C:\Users\isuru\AppData\Local\Temp\opencode\nexus_audit_copy")
SHOTS = SRC / ".phase1_audit_site" / "shots_before"

if WORK.exists():
    shutil.rmtree(WORK)
shutil.copytree(SRC, WORK, ignore=shutil.ignore_patterns(".git", ".phase1_audit_site", "__pycache__", ".freebuff"))

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
STUB_MOST = {"games": [
    {"game_name": "PUBG: BATTLEGROUNDS", "total_hours": "48.5", "unique_players": 6},
    {"game_name": "Brawlhalla", "total_hours": "32.1", "unique_players": 4},
    {"game_name": "ARC Raiders", "total_hours": "19.8", "unique_players": 3}]}

def stub_routes(page, empty=False):
    def api(route):
        url = route.request.url
        if "most-played" in url:
            route.fulfill(status=200, content_type="application/json", body=json.dumps({"games": []} if empty else STUB_MOST["games"] if isinstance(STUB_MOST, dict) else STUB_MOST))
        elif "bot_data" in url or "public_stats" in url or "voice" in url or "stats" in url:
            body = dict(STUB_STATS)
            if empty:
                body["top_played_games"] = []
                body["playing_games"] = []
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        else:
            route.fulfill(status=200, content_type="application/json", body="{}")
    page.route("**/api/**", api)
    page.route("https://discord.com/api/**", lambda r: r.fulfill(status=200, content_type="application/json", body='{"approximate_member_count": 48}'))
    # block heavy/remote media so shots are deterministic; site has onerror fallbacks
    page.route("https://images.unsplash.com/**", lambda r: r.abort())
    page.route("https://images.igdb.com/**", lambda r: r.abort())
    page.route("https://steamcdn-a.akamaihd.net/**", lambda r: r.abort())
    page.route("https://cdn.discordapp.com/**", lambda r: r.abort())
    page.route("**/ws/**", lambda r: r.abort())

def goto_tab(page, tab):
    page.goto(f"{base}#{tab}")
    page.wait_for_timeout(1200)

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox", "--autoplay-policy=no-user-gesture-required"])
    # --- desktop 1920 full + sections ---
    pg = browser.new_page(viewport={"width": 1920, "height": 1080})
    stub_routes(pg)
    goto_tab(pg, "home")
    pg.screenshot(path=str(SHOTS / "full_1920x1080_home.png"), full_page=True)
    pg.screenshot(path=str(SHOTS / "section_hero_1440.png"))
    pg2 = browser.new_page(viewport={"width": 1440, "height": 900})
    stub_routes(pg2)
    goto_tab(pg2, "home")
    pg2.screenshot(path=str(SHOTS / "full_1440x900_home.png"), full_page=True)
    # hover + focus states on main buttons
    try:
        pg2.hover(".hero-btns .btn-primary")
        pg2.wait_for_timeout(400)
        pg2.screenshot(path=str(SHOTS / "state_button_hover.png"))
        pg2.focus(".hero-btns .btn-primary")
        pg2.wait_for_timeout(300)
        pg2.screenshot(path=str(SHOTS / "state_button_focus.png"))
    except Exception as e:
        print("hover/focus shot failed:", e)
    # lounge empty
    goto_tab(pg2, "lounge")
    pg2.screenshot(path=str(SHOTS / "section_lounge_empty_1440.png"), full_page=True)
    # lounge populated (stub games render automatically from stub stats)
    pg2.wait_for_timeout(2500)
    pg2.screenshot(path=str(SHOTS / "section_lounge_populated_1440.png"), full_page=True)
    # most-played tab
    try:
        pg2.click('.lounge-tab-btn[data-lounge-tab="most-played"]')
        pg2.wait_for_timeout(1200)
        pg2.screenshot(path=str(SHOTS / "section_lounge_mostplayed_1440.png"), full_page=True)
        pg2.click('.lounge-tab-btn[data-lounge-tab="live"]')
        pg2.wait_for_timeout(800)
    except Exception as e:
        print("most-played shot failed:", e)
    # game modal open (click first card if present)
    try:
        pg2.wait_for_selector(".game-card", timeout=8000)
        pg2.click(".game-card")
        pg2.wait_for_timeout(800)
        pg2.screenshot(path=str(SHOTS / "section_game_modal_1440.png"))
        pg2.keyboard.press("Escape")
        pg2.wait_for_timeout(400)
    except Exception as e:
        print("game modal shot skipped:", e)
    for tab, name in [("about", "section_about_1440.png"), ("features", "section_features_1440.png"),
                      ("commands", "section_commands_1440.png"), ("stats", "section_stats_1440.png"),
                      ("home-cta", "section_cta_1440.png")]:
        goto_tab(pg2, tab)
        if tab == "commands":
            try:
                pg2.click('.cmd-filter[data-filter="ai"]')
                pg2.wait_for_timeout(600)
                pg2.screenshot(path=str(SHOTS / "state_command_tab_active.png"))
                pg2.click('.cmd-filter[data-filter="all"]')
                pg2.wait_for_timeout(400)
            except Exception as e:
                print("cmd tab shot failed:", e)
        pg2.screenshot(path=str(SHOTS / name), full_page=True)
    # teamspeak modal + copy state
    goto_tab(pg2, "home-cta")
    try:
        pg2.click("#cta-ts-connect-btn")
        pg2.wait_for_timeout(600)
        pg2.screenshot(path=str(SHOTS / "section_teamspeak_card_1440.png"))
        pg2.click("#ts-copy-btn")
        pg2.wait_for_timeout(600)
        pg2.screenshot(path=str(SHOTS / "state_teamspeak_copied.png"))
        pg2.keyboard.press("Escape")
    except Exception as e:
        print("teamspeak shot failed:", e)
    # navbar closeup + footer note (footer hidden by design)
    goto_tab(pg2, "home")
    try:
        pg2.evaluate("window.scrollTo(0,0)")
        pg2.wait_for_timeout(300)
        pg2.screenshot(path=str(SHOTS / "section_navbar_1440.png"), clip={"x": 0, "y": 0, "width": 1440, "height": 200})
    except Exception as e:
        print("navbar clip failed:", e)
    pg2.close(); pg.close()
    # --- mobile ---
    mp = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    stub_routes(mp)
    goto_tab(mp, "home")
    mp.screenshot(path=str(SHOTS / "full_mobile_390x844_home.png"), full_page=True)
    goto_tab(mp, "lounge")
    mp.wait_for_timeout(2000)
    mp.screenshot(path=str(SHOTS / "full_mobile_390x844_lounge.png"), full_page=True)
    mp.close()
    browser.close()

httpd.shutdown()
print("shots done:")
for f in sorted(SHOTS.glob("*.png")):
    print(" ", f.name, f.stat().st_size)
