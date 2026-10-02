"""Logo swap verify — BEFORE (backup images) vs AFTER (new images), stubbed, 1440x900 + 390x844."""
import shutil, threading, functools, pathlib
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

SRC = pathlib.Path(r"D:\repo\2026 web\nexus-2026 lime green update\nexus-2026")
SHOTS = SRC / ".phase2_site" / "shots_logo_swap"
(SHOTS).mkdir(parents=True, exist_ok=True)

def serve(tree, port_holder, tag):
    if tree.exists():
        shutil.rmtree(tree)
    shutil.copytree(SRC, tree, ignore=shutil.ignore_patterns(".git", ".phase1_audit_site", ".phase2_site", "__pycache__", ".freebuff", "*.bak_lime"))
    if tag == "before":
        shutil.copyfile(SRC / ".phase2_site" / "logo_backup" / "nexus_logo.png", tree / "images" / "nexus_logo.png")
    h = functools.partial(SimpleHTTPRequestHandler, directory=str(tree))
    srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/index.html"

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
    for tag in ["before", "after"]:
        tree = pathlib.Path(r"C:\Users\isuru\AppData\Local\Temp\opencode\logo_" + tag)
        srv, base = serve(tree, None, tag)
        pg = browser.new_page(viewport={"width": 1440, "height": 900})
        pg.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        pg.goto(base); pg.wait_for_timeout(1800)
        pg.screenshot(path=str(SHOTS / f"{tag}_navbar_1440.png"), clip={"x": 0, "y": 0, "width": 1440, "height": 120})
        pg.screenshot(path=str(SHOTS / f"{tag}_hero_1440.png"))
        box = pg.evaluate("(() => { const i = document.querySelector('.nav-logo img'); const r = i.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()")
        print(tag, "nav logo box:", box)
        pg.close()
        mp = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mp.route("**/*", lambda r: r.continue_() if "127.0.0.1" in r.request.url else r.abort())
        mp.goto(base); mp.wait_for_timeout(1800)
        mp.screenshot(path=str(SHOTS / f"{tag}_hero_mobile_390.png"))
        mp.close()
        srv.shutdown()
    browser.close()
print("shots:", sorted(p.name for p in SHOTS.glob("*.png")))
