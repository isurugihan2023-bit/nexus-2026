"""scripts/e2e_live.py - Playwright e2e for the LIVE page (no design change, real data shapes).

Serves the repo statically, intercepts /api/* with NEW public-API shapes,
then asserts:
  - Live Sessions renders one card PER GAME with real names/categories.
  - Most Played renders per-GAME 'N players, X h' cards (never member names).
  - No page errors, no horizontal scroll at 1366 and 390 widths.
  - Screenshots saved to scripts/e2e_shots/ for visual review.
Usage: python scripts/e2e_live.py
"""
import functools
import http.server
import json
import os
import socketserver
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SHOTS = os.path.join(ROOT, "scripts", "e2e_shots")
os.makedirs(SHOTS, exist_ok=True)

LIVE_STUB = {
    "generated_at": 1789744800000,
    "games": [
        {"game_key": "ceylon-roleplay", "name": "Ceylon Roleplay",
         "category": "FiveM Roleplay", "image": "images/games/fallback.svg",
         "server_players": {"current": 50, "max": 100},
         "players": [
             {"name": "Animo", "avatar": "https://cdn.discordapp.com/embed/avatars/0.png",
              "details": "Players 50/100", "state": "", "since": 1789741000000},
             {"name": "SL_LIDDA", "avatar": "https://cdn.discordapp.com/embed/avatars/1.png",
              "details": "Players 50/100", "state": "", "since": 1789742000000}],
         "player_count": 2},
        {"game_key": "valorant", "name": "VALORANT",
         "category": "Tactical FPS", "image": "images/games/fallback.svg",
         "server_players": None,
         "players": [{"name": "Diaa", "avatar": "https://cdn.discordapp.com/embed/avatars/2.png",
                      "details": "Competitive Match", "state": "", "since": 1789743000000}],
         "player_count": 1},
    ],
    "total_playing": 3,
    "stale": False,
}

# Legacy bot shape (production today): name-only items, NO game_key /
# category / image, Discord rich_cover for some games. The page must still
# render real labels + real art from this shape (resilience path).
MP_STUB = {
    "period": "week",
    "games": [
        {"name": "Ceylon Roleplay", "total_hours": 10.1, "unique_players": 4,
         "sessions": 12,
         "rich_cover": "https://cdn.discordapp.com/app-assets/945695523376103484/1065968155949797427.png"},
        {"name": "VALORANT", "total_hours": 3.6, "unique_players": 4,
         "sessions": 5, "rich_cover": None},
        {"name": "F1 25", "total_hours": 2.5, "unique_players": 2,
         "sessions": 5, "rich_cover": None},
    ],
    "stale": False,
}


def serve():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, port


def handle_route(route):
    url = route.request.url
    if "most-played" in url:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(MP_STUB))
    elif "/api/public/live" in url and "stream" not in url:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps(LIVE_STUB))
    elif "/api/public_stats" in url or "/api/bot_data" in url:
        route.fulfill(status=200, content_type="application/json",
                      body=json.dumps({"ninja_nexus_members": 48, "total_users": 48,
                                       "ping": 106, "uptime_seconds": 43100}))
    else:
        route.continue_()


def check_width(pw, base, width, height, tag):
    errors = []
    browser = pw.chromium.launch()
    pg = browser.new_page(viewport={"width": width, "height": height})
    bad_urls = []
    stream_404s = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    def _on_resp(r):
        if r.status >= 400:
            bad_urls.append(r.url)
            if "live/stream" in r.url:
                stream_404s.append(r.url)
    pg.on("response", _on_resp)
    pg.route("**/api/**", handle_route)
    pg.goto(base + "/index.html#lounge", wait_until="domcontentloaded")
    pg.wait_for_timeout(2500)
    live_cards = pg.evaluate("document.querySelectorAll('#live-games-grid .game-card').length")
    assert live_cards == 2, f"[{tag}] expected 2 live cards, got {live_cards}"
    live_titles = pg.evaluate(
        "[...document.querySelectorAll('#live-games-grid .game-card .game-name')].map(e=>e.textContent)")
    assert "Ceylon Roleplay" in live_titles and "VALORANT" in live_titles, live_titles
    assert not any("kiri putha" in t for t in live_titles), live_titles
    pg.screenshot(path=os.path.join(SHOTS, f"live_{tag}.png"))
    # Most Played tab
    pg.click('.lounge-tab-btn[data-lounge-tab="most-played"]')
    pg.wait_for_timeout(1500)
    mp_cards = pg.evaluate(
        "document.querySelectorAll('#lounge-most-played-container .game-card').length")
    assert mp_cards == 3, f"[{tag}] expected 3 most-played cards, got {mp_cards}"
    mp_titles = pg.evaluate(
        "[...document.querySelectorAll('#lounge-most-played-container .game-card .game-name')].map(e=>e.textContent)")
    assert "VALORANT" in mp_titles and "Ceylon Roleplay" in mp_titles and "F1 25" in mp_titles, mp_titles
    mp_head = pg.evaluate(
        "[...document.querySelectorAll('#lounge-most-played-container .game-player-name')].map(e=>e.textContent)")
    assert any("4 players, 10.1 h" in h for h in mp_head), mp_head
    assert not any("kiri putha" in h for h in mp_head), mp_head
    # Real category labels even from the legacy name-only API shape
    mp_tags = pg.evaluate(
        "[...document.querySelectorAll('#lounge-most-played-container .game-genre-tag')].map(e=>e.textContent.trim().toLowerCase())")
    assert "tactical fps" in mp_tags, mp_tags
    assert "fivem roleplay" in mp_tags, mp_tags
    assert "racing" in mp_tags, mp_tags
    assert "gaming" not in mp_tags, f"[{tag}] generic GAMING label leaked: {mp_tags}"
    # Real covers: Discord rich art for Ceylon, known art (not the robot
    # placeholder) for the rest
    mp_imgs = pg.evaluate(
        "[...document.querySelectorAll('#lounge-most-played-container .game-card-img-wrap img')].map(e=>e.currentSrc || e.src)")
    assert any("app-assets/945695523376103484" in s for s in mp_imgs), mp_imgs
    assert not any("fallback.svg" in s for s in mp_imgs), f"[{tag}] placeholder leaked: {mp_imgs}"
    # No raw Discord user IDs exposed: visible card text must not contain
    # long digit runs (Discord CDN art-asset IDs inside image URLs are
    # public game art, not member IDs — display name + avatar URL is the
    # allowed public shape), and no id-bearing data attributes may exist.
    import re as _re
    card_text = pg.evaluate("document.getElementById('lounge-most-played-container').innerText")
    assert not _re.search(r"\b\d{15,25}\b", card_text), "raw Discord ID leaked"
    card_html = pg.evaluate("document.getElementById('lounge-most-played-container').innerHTML")
    assert "user_id" not in card_html and "player_id" not in card_html, "id field leaked"
    pg.screenshot(path=os.path.join(SHOTS, f"mostplayed_{tag}.png"))
    # Modal opens on card click (who's in session)
    pg.click('.lounge-tab-btn[data-lounge-tab="live"]')
    pg.wait_for_timeout(800)
    pg.eval_on_selector("#live-games-grid .game-card", "c => c.click()")
    pg.wait_for_timeout(800)
    modal_open = pg.evaluate(
        "document.getElementById('game-session-modal').classList.contains('active')")
    assert modal_open, f"[{tag}] game modal did not open"
    pg.screenshot(path=os.path.join(SHOTS, f"modal_{tag}.png"))
    # No horizontal scroll
    overflow = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    assert overflow <= 1, f"[{tag}] horizontal overflow: {overflow}px"
    # Benign on the static test host: no SSE proxy here (production nginx
    # proxies /api/public/live/stream to the bot; the page falls back to
    # 10s polling, which is exactly what this asserts).
    # Generic "404 (File not found)" console texts carry no URL; attribute
    # them to the SSE probe when a stream 404 was actually observed.
    real_errors = []
    for e in errors:
        le = e.lower()
        if "favicon" in le or "net::" in le or "font" in le or "cdn" in le:
            continue
        if "live/stream" in le:
            continue
        if "404" in le and stream_404s:
            stream_404s.pop(0)
            continue
        real_errors.append(e)
    # Any failed request that is NOT the (optionally unproxied) SSE stream
    # or favicon is a real problem.
    bad = [u for u in bad_urls if "live/stream" not in u and "favicon" not in u.lower()]
    real_errors += [f"bad-response: {u}" for u in sorted(set(bad))]
    browser.close()
    return real_errors


def main():
    httpd, port = serve()
    base = f"http://127.0.0.1:{port}"
    all_errors = []
    try:
        with sync_playwright() as pw:
            for w, h, tag in [(1366, 900, "desktop"), (390, 844, "phone")]:
                errs = check_width(pw, base, w, h, tag)
                all_errors += [(tag, e) for e in errs]
                print(f"[e2e:{tag}] OK (live + most-played + modal + no-overflow)")
    finally:
        httpd.shutdown()
    if all_errors:
        print("[e2e] console/page errors:", all_errors)
        raise SystemExit(1)
    print("[e2e] ALL E2E CHECKS PASSED [OK] ->", SHOTS)


if __name__ == "__main__":
    main()
