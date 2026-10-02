"""Round 3 — inject stub games directly via renderLiveGames (same render path), capture populated + modal."""
import threading, functools, pathlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

SRC = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
WORK = pathlib.Path(r"C:\Users\isuru\AppData\Local\Temp\opencode\nexus_audit_copy")
SHOTS = SRC / ".phase1_audit_site" / "shots_before"

Handler = functools.partial(SimpleHTTPRequestHandler, directory=str(WORK))
httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{port}/index.html"

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    pg = browser.new_page(viewport={"width": 1440, "height": 900})
    pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
    pg.goto(base)
    pg.wait_for_timeout(1500)
    pg.evaluate("""showTab('lounge'); renderLiveGames([
      {name:'VALORANT', count:2, players:['Animo','SL_LIDDA'],
       player_details:[
        {name:'Animo', avatar:'https://cdn.discordapp.com/embed/avatars/0.png', details:'Competitive Match'},
        {name:'SL_LIDDA', avatar:'https://cdn.discordapp.com/embed/avatars/1.png', details:'Competitive Match'}],
       sample_detail:'Competitive Match'},
      {name:'PUBG: BATTLEGROUNDS', count:1, players:['local leclerc'],
       player_details:[{name:'local leclerc', avatar:'https://cdn.discordapp.com/embed/avatars/2.png', details:'Normal, Erangel - 2 Squad'}],
       sample_detail:'Normal, Erangel - 2 Squad'}
    ]);""")
    pg.wait_for_timeout(1200)
    n = pg.evaluate("document.querySelectorAll('#live-games-grid .game-card').length")
    print("cards:", n)
    pg.screenshot(path=str(SHOTS / "section_lounge_populated_1440.png"), full_page=True)
    pg.evaluate("document.querySelector('#live-games-grid .game-card').click()")
    pg.wait_for_timeout(800)
    vis = pg.evaluate("document.getElementById('game-session-modal').className")
    print("modal class:", vis)
    pg.screenshot(path=str(SHOTS / "section_game_modal_1440.png"))
    pg.keyboard.press("Escape")
    pg.close()
    browser.close()
httpd.shutdown()
print("round3 done")
