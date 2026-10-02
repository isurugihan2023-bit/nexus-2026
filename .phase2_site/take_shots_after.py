"""Phase 2 Step 6 — render NEW index.html (copy in temp, stubbed APIs), shots_after + lime budget + console errors."""
import threading, functools, pathlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from PIL import Image
import io

SRC = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
WORK = pathlib.Path(r"C:\Users\isuru\AppData\Local\Temp\opencode\nexus_after_copy")
SHOTS = SRC / ".phase2_site" / "shots_after"

import shutil
if WORK.exists():
    shutil.rmtree(WORK)
shutil.copytree(SRC, WORK, ignore=shutil.ignore_patterns(".git", ".phase1_audit_site", ".phase2_site", "__pycache__", ".freebuff", "*.bak_lime"))

Handler = functools.partial(SimpleHTTPRequestHandler, directory=str(WORK))
httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}/index.html"

from playwright.sync_api import sync_playwright

STUB = """showTab('lounge'); renderLiveGames([
  {name:'VALORANT', count:2, players:['Animo','SL_LIDDA'],
   player_details:[
    {name:'Animo', avatar:'https://cdn.discordapp.com/embed/avatars/0.png', details:'Competitive Match'},
    {name:'SL_LIDDA', avatar:'https://cdn.discordapp.com/embed/avatars/1.png', details:'Competitive Match'}],
   sample_detail:'Competitive Match'},
  {name:'PUBG: BATTLEGROUNDS', count:1, players:['local leclerc'],
   player_details:[{name:'local leclerc', avatar:'https://cdn.discordapp.com/embed/avatars/2.png', details:'Normal, Erangel - 2 Squad'}],
   sample_detail:'Normal, Erangel - 2 Squad'}
]);"""

def lime_pct(png_path):
    im = Image.open(png_path).convert("RGB")
    px = im.load()
    w, h = im.size
    n = 0
    step = 4
    tot = 0
    for y in range(0, h, step):
        for x in range(0, w, step):
            r, g, b = px[x, y]
            tot += 1
            if r > 140 and g > 170 and b < 130 and (g - b) > 90:
                n += 1
    return 100.0 * n / tot

errors = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    pg = browser.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(f"{m.type}: {m.text[:160]}") if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errors.append(f"pageerror: {str(e)[:160]}"))
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.goto(base)
    pg.wait_for_timeout(2000)

    def show(tab):
        pg.evaluate(f"showTab({tab!r})")
        pg.wait_for_timeout(1000)

    show("home")
    pg.screenshot(path=str(SHOTS / "full_1440x900_home.png"), full_page=True)
    pg.screenshot(path=str(SHOTS / "section_hero_1440.png"))
    pg.evaluate("window.scrollTo(0,0)")
    pg.screenshot(path=str(SHOTS / "section_navbar_1440.png"), clip={"x": 0, "y": 0, "width": 1440, "height": 200})
    pg.hover(".hero-btns .btn-primary"); pg.wait_for_timeout(400)
    pg.screenshot(path=str(SHOTS / "state_button_hover.png"))
    pg.focus(".hero-btns .btn-primary"); pg.wait_for_timeout(300)
    pg.screenshot(path=str(SHOTS / "state_button_focus.png"))
    show("lounge"); pg.evaluate("renderLiveGames([])"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(SHOTS / "section_lounge_empty_1440.png"), full_page=True)
    pg.evaluate(STUB); pg.wait_for_timeout(1000)
    pg.screenshot(path=str(SHOTS / "section_lounge_populated_1440.png"), full_page=True)
    pg.evaluate("document.querySelector('#live-games-grid .game-card').click()"); pg.wait_for_timeout(700)
    pg.screenshot(path=str(SHOTS / "section_game_modal_1440.png"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
    for tab, name in [("about", "section_about_1440.png"), ("features", "section_features_1440.png"),
                      ("stats", "section_stats_1440.png"), ("home-cta", "section_cta_1440.png")]:
        show(tab)
        pg.screenshot(path=str(SHOTS / name), full_page=True)
    show("commands")
    pg.eval_on_selector('.cmd-filter[data-filter="ai"]', "b => b.click()"); pg.wait_for_timeout(600)
    pg.screenshot(path=str(SHOTS / "state_command_tab_active.png"))
    show("commands")
    pg.screenshot(path=str(SHOTS / "section_commands_1440.png"), full_page=True)
    show("home-cta")
    pg.eval_on_selector("#cta-ts-connect-btn", "b => b.click()"); pg.wait_for_timeout(600)
    pg.screenshot(path=str(SHOTS / "section_teamspeak_card_1440.png"))
    pg.eval_on_selector("#ts-copy-btn", "b => b.click()"); pg.wait_for_timeout(500)
    pg.screenshot(path=str(SHOTS / "state_teamspeak_copied.png"))
    pg.keyboard.press("Escape")
    # most-played (stub container directly)
    show("lounge")
    pg.evaluate("""document.getElementById('live-games-grid').style.display='none';
      document.getElementById('lounge-most-played-container').style.display='';
      document.getElementById('lounge-most-played-container').innerHTML='<div class=\"live-games-grid\">'+document.querySelector('#live-games-grid').innerHTML+'</div>';""")
    pg.evaluate(STUB.replace("showTab('lounge'); ", ""))
    pg.wait_for_timeout(600)
    pg.screenshot(path=str(SHOTS / "section_lounge_mostplayed_1440.png"), full_page=True)
    pg.close()
    # 1920 + mobile
    p2 = browser.new_page(viewport={"width": 1920, "height": 1080})
    p2.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    p2.goto(base); p2.wait_for_timeout(1800)
    p2.screenshot(path=str(SHOTS / "full_1920x1080_home.png"), full_page=True)
    p2.close()
    mp = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    mp.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    mp.goto(base); mp.wait_for_timeout(1800)
    mp.screenshot(path=str(SHOTS / "full_mobile_390x844_home.png"), full_page=True)
    mp.evaluate("showTab('lounge')"); mp.wait_for_timeout(800)
    mp.screenshot(path=str(SHOTS / "full_mobile_390x844_lounge.png"), full_page=True)
    mp.close()
    browser.close()
httpd.shutdown()

print("--- lime budget ---")
for f in sorted(SHOTS.glob("*.png")):
    print(f"  {f.name}: {lime_pct(f):.2f}% lime")
print("--- console errors/warnings ---")
seen = set()
for e in errors:
    if e not in seen:
        seen.add(e)
        print(" ", e)
if not errors:
    print("  (none)")
print("shots:", len(list(SHOTS.glob('*.png'))))
