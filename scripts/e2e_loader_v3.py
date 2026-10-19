"""e2e for the redesigned nx-loader (v3): visuals + all preserved behavior."""
import functools, http.server, json, os, socketserver, sys, threading, time as _time
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
os.makedirs(os.path.join(ROOT, "scripts", "e2e_shots"), exist_ok=True)


class ThrottledHandler(http.server.SimpleHTTPRequestHandler):
    LATENCY = 0.30
    CHUNK = 16 * 1024
    PAUSE = 0.30

    def end_headers(self):
        _time.sleep(self.LATENCY)
        super().end_headers()

    def copyfile(self, src, dst):
        while True:
            buf = src.read(self.CHUNK)
            if not buf:
                break
            try:
                dst.write(buf)
                dst.flush()
            except Exception:
                return
            _time.sleep(self.PAUSE)


def serve(handler_cls=http.server.SimpleHTTPRequestHandler):
    handler = functools.partial(handler_cls, directory=ROOT)
    class Quiet(socketserver.ThreadingMixIn, socketserver.TCPServer):
        daemon_threads = True
        def log_message(self, *a): pass
    httpd = Quiet(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{httpd.server_address[1]}"


def stub_api(route):
    route.fulfill(status=200, content_type="application/json",
                  body=json.dumps({"ok": True, "games": [], "players": [], "total_playing": 0, "stale": True}))


def route_all(route):
    if route.request.url.startswith("http://127.0.0.1"):
        route.continue_()
    else:
        route.abort()


# Installed from the very first navigation moment: records exit choreography
# (nx-fade class -> panel transform + stage fade) without racing the fast loader.
EXIT_OBSERVER = """
window.__nxExit = { sawFade: false, tyTop: null, stageOpacities: [], gone: false, panelTransition: null };
(function () {
  var iv = setInterval(function () {
    var el = document.getElementById('nx-loader');
    if (!el) { clearInterval(iv); window.__nxExit.gone = true; return; }
    if (el.classList.contains('nx-fade')) {
      window.__nxExit.sawFade = true;
      try {
        var t = getComputedStyle(el.querySelector('.nx-panel-top')).transform;
        if (t !== 'none') { try { window.__nxExit.tyTop = new DOMMatrix(t).m42; } catch (e) { window.__nxExit.tyTop = t; } }
        window.__nxExit.stageOpacities.push(getComputedStyle(el.querySelector('.nx-stage')).opacity);
        if (!window.__nxExit.panelTransition) window.__nxExit.panelTransition = getComputedStyle(el.querySelector('.nx-panel-top')).transitionDuration;
      } catch (e) {}
    }
  }, 30);
})();
"""


FAIL = []
def check(name, cond, extra=""):
    print(("PASS  " if cond else "FAIL  ") + name + (("  " + str(extra)) if extra else ""))
    if not cond:
        FAIL.append(name)


with sync_playwright() as pw:
    browser = pw.chromium.launch()
    base = serve()
    base_slow = serve(ThrottledHandler)

    # ── 1. First view: visual structure ─────────────────────────────
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    page = ctx.new_page()
    page.route("**/api/**", stub_api)
    page.route("**/*", route_all)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(EXIT_OBSERVER)

    page.goto(base + "/index.html", wait_until="commit")
    page.wait_for_selector("#nx-loader", timeout=5000, state="visible")
    v = page.evaluate("""() => {
        const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
        const img = document.getElementById('nx-loader-img');
        const bar = document.querySelector('.nx-bar');
        return {
            panels: document.querySelectorAll('.nx-panel').length,
            panelTopBg: cs('.nx-panel-top', 'backgroundColor'),
            loaderBg: cs('#nx-loader', 'backgroundColor'),
            zIndex: cs('#nx-loader', 'zIndex'),
            font: cs('#nx-loader', 'fontFamily').slice(0, 20),
            ringAnim: cs('.nx-ring', 'animationName'), ringDur: cs('.nx-ring', 'animationDuration'),
            ring2Delay: cs('.nx-ring2', 'animationDelay'),
            sweepAnim: cs('.nx-sweep', 'animationName'), sweepDur: cs('.nx-sweep', 'animationDuration'),
            sheenAnim: cs('.nx-sheen', 'animationName'), sheenDur: cs('.nx-sheen', 'animationDuration'),
            logoAnim: cs('.nx-logo-shell', 'animationName'), logoAnimDur: cs('.nx-logo-shell', 'animationDuration'),
            logoSize: cs('.nx-logo-shell', 'width'),
            maskImage: cs('.nx-logo', 'maskImage') || cs('.nx-logo', 'webkitMaskImage'),
            imgSrc: img ? img.currentSrc.split('/').slice(-1)[0] : null,
            barBorderW: cs('.nx-bar', 'borderTopWidth'), barRadius: cs('.nx-bar', 'borderTopLeftRadius'),
            progressW: cs('.nx-progress', 'width'), barH: cs('.nx-bar', 'height'),
            fillOverflow: cs('.nx-fill', 'overflow'), fillOrigin: cs('.nx-fill', 'transformOrigin'),
            pctSize: cs('.nx-pct', 'fontSize'), pctTabular: cs('.nx-pct', 'fontVariantNumeric'),
            pctColor: cs('#nx-loader-pct', 'color'),
            wordmarkSize: cs('.nx-wordmark', 'fontSize'), wordmarkWeight: cs('.nx-wordmark', 'fontWeight'),
            wordmarkSpacing: cs('.nx-wordmark', 'letterSpacing'),
            w1Color: cs('.nx-wordmark span:first-child', 'color'), w2Color: cs('.nx-w2', 'color'),
            taglineSize: cs('.nx-tagline', 'fontSize'), taglineSpacing: cs('.nx-tagline', 'letterSpacing'),
            statusText: (document.querySelector('.nx-status') || {}).textContent || null,
            sinceText: (document.querySelector('.nx-since') || {}).textContent || null,
            topoOpacity: cs('.nx-topo', 'opacity'), topoImage: cs('.nx-topo', 'backgroundImage') || '',
            vignette: (cs('.nx-vignette', 'backgroundImage') || '').slice(0, 40),
            labelGone: !document.querySelector('.nx-label'),
            ariaNow: bar.getAttribute('aria-valuenow'), pctNow: document.getElementById('nx-loader-pct').textContent,
            filterCheck: [cs('.nx-logo', 'filter'), cs('.nx-logo', 'backdropFilter'), cs('.nx-topo', 'filter'), cs('.nx-sweep', 'filter')],
        };
    }""")
    check("curtain panels present", v["panels"] == 2)
    check("loader root transparent (panels are the base)", v["loaderBg"] in ("rgba(0, 0, 0, 0)", "transparent"), v["loaderBg"])
    check("panel solid dark", v["panelTopBg"] == "rgb(15, 15, 15)", v["panelTopBg"])
    check("z-index top", v["zIndex"] == "2147483647")
    check("fonts = Manrope var", "Manrope" in v["font"], v["font"])
    check("transparent logo used", v["imgSrc"] == "nexus-n-transparent.png", v["imgSrc"])
    check("mask-image on .nx-logo", bool(v["maskImage"]) and "nexus-n-transparent.png" in v["maskImage"], (v["maskImage"] or "")[:80])
    check("sonar ring 2s + second delay 1s", v["ringAnim"] == "nxSonar" and v["ringDur"] == "2s" and v["ring2Delay"].startswith("1s"),
          f"{v['ringAnim']}/{v['ringDur']}/{v['ring2Delay']}")
    check("sweep 2.2s", v["sweepAnim"] == "nxSweep" and v["sweepDur"] == "2.2s", f"{v['sweepAnim']}/{v['sweepDur']}")
    check("sheen inside fill 1.5s", v["sheenAnim"] == "nxSheen" and v["sheenDur"] == "1.5s", f"{v['sheenAnim']}/{v['sheenDur']}")
    check("entrance nxLogoIn .6s", v["logoAnim"] == "nxLogoIn" and v["logoAnimDur"] == "0.6s", f"{v['logoAnim']}/{v['logoAnimDur']}")
    check("logo 128px", v["logoSize"] == "128px", v["logoSize"])
    check("bar 6px rounded + 1px border", v["barH"] == "6px" and v["barRadius"].startswith("999") and v["barBorderW"] == "1px",
          f"{v['barH']}/{v['barRadius']}/{v['barBorderW']}")
    check("progress row min(340px,78vw)", v["progressW"] == "340px", v["progressW"])
    check("fill clips sheen + scaleX origin left", v["fillOverflow"] == "hidden" and v["fillOrigin"].startswith("0px"), f"{v['fillOverflow']}/{v['fillOrigin']}")
    check("pct 28px tabular lime", v["pctSize"] == "28px" and "tabular" in v["pctTabular"] and v["pctColor"] == "rgb(198, 227, 43)",
          f"{v['pctSize']}/{v['pctTabular']}/{v['pctColor']}")
    check("wordmark 22px/800/.28em", v["wordmarkSize"] == "22px" and v["wordmarkWeight"] == "800" and v["wordmarkSpacing"] == "0.28em",
          f"{v['wordmarkSize']}/{v['wordmarkWeight']}/{v['wordmarkSpacing']}")
    check("NINJA light + NEXUS lime", v["w2Color"] == "rgb(198, 227, 43)" and v["w1Color"] != v["w2Color"], f"{v['w1Color']} / {v['w2Color']}")
    check("tagline 11px/.2em", v["taglineSize"] == "11px" and v["taglineSpacing"] == "0.2em", f"{v['taglineSize']}/{v['taglineSpacing']}")
    check("status starts 'Starting up'", v["statusText"] == "Starting up", v["statusText"])
    check("'Since March 2026' present", v["sinceText"] == "Since March 2026", v["sinceText"])
    check("topo pattern 8% opacity (hero asset)", v["topoOpacity"] == "0.08" and "bg-topo" in v["topoImage"], v["topoImage"][:90])
    check("static radial vignette", "radial-gradient" in v["vignette"], v["vignette"])
    check("old tiny label removed", v["labelGone"])
    check("pct text === aria-valuenow", str(v["ariaNow"]) + "%" == v["pctNow"])
    check("no filter/backdrop-filter anywhere in loader", all(f in ("none", "rgba(0, 0, 0, 0)") for f in v["filterCheck"]), str(v["filterCheck"]))

    page.wait_for_timeout(250)
    page.screenshot(path=os.path.join(ROOT, "scripts", "e2e_shots", "loader_v2_desktop.png"))
    page.set_viewport_size({"width": 390, "height": 844}); page.wait_for_timeout(140)
    page.screenshot(path=os.path.join(ROOT, "scripts", "e2e_shots", "loader_v2_mobile.png"))
    page.set_viewport_size({"width": 320, "height": 640}); page.wait_for_timeout(120)
    ov320 = page.evaluate("""() => ({
        sw: document.documentElement.scrollWidth, vw: innerWidth,
        logo: getComputedStyle(document.querySelector('.nx-logo-shell')).height,
        wordmark: getComputedStyle(document.querySelector('.nx-wordmark')).fontSize })""")
    page.set_viewport_size({"width": 700, "height": 380}); page.wait_for_timeout(120)
    short = page.evaluate("""() => ({
        logo: getComputedStyle(document.querySelector('.nx-logo-shell')).height,
        ring: getComputedStyle(document.querySelector('.nx-ring')).display,
        since: getComputedStyle(document.querySelector('.nx-since')).display })""")
    page.screenshot(path=os.path.join(ROOT, "scripts", "e2e_shots", "loader_v2_landscape.png"))
    page.set_viewport_size({"width": 1280, "height": 800}); page.wait_for_timeout(100)
    check("320px: no h-overflow, logo 96", ov320["sw"] <= ov320["vw"] + 1 and ov320["logo"] == "96px", json.dumps(ov320))
    check("short height: logo 72, ring+since hidden", short["logo"] == "72px" and short["ring"] == "none" and short["since"] == "none", json.dumps(short))

    # exit choreography (observer ran from the very start)
    gone = page.wait_for_function("() => window.__nxExit && window.__nxExit.gone", timeout=9000)
    ex = page.evaluate("() => window.__nxExit")
    check("exit: nx-fade -> panel slide (negative ty)", ex["sawFade"] and ex["tyTop"] is not None and ex["tyTop"] < 0,
          json.dumps({k: ex[k] for k in ("sawFade", "tyTop", "panelTransition")}))
    check("exit: panel transition .6s", ex["panelTransition"] == "0.6s", ex["panelTransition"])
    check("exit: stage content faded", ex["stageOpacities"] and float(ex["stageOpacities"][0]) < 1, str(ex["stageOpacities"][:3]))
    check("element + CSS removed", not page.query_selector("#nx-loader") and not page.query_selector("#nx-loader-css"))
    after = page.evaluate("""() => ({ htmlOv: document.documentElement.style.overflow, bodyOv: document.body.style.overflow,
        fs: sessionStorage.getItem('nx-loader-shown'), pct: null })""")
    check("overflow restored", after["htmlOv"] != "hidden" and after["bodyOv"] != "hidden")
    check("sessionStorage flag set", after["fs"] == "1")
    page.wait_for_timeout(600)
    check("no pageerror (run 1)", len(errors) == 0, "; ".join(errors))

    # ── 2. Reload same tab → skipped ────────────────────────────────
    page.goto(base + "/index.html", wait_until="domcontentloaded")
    s = page.evaluate("""() => ({ gone: !document.getElementById('nx-loader'), skip: document.documentElement.classList.contains('nx-skip'),
        cssGone: !document.getElementById('nx-loader-css') })""")
    check("reload: skipped + nx-skip + no residue", s["gone"] and s["skip"] and s["cssGone"])

    # ── 3. Fresh context shows it again ─────────────────────────────
    ctx2 = browser.new_context(viewport={"width": 1280, "height": 800})
    p2 = ctx2.new_page()
    p2.route("**/api/**", stub_api); p2.route("**/*", route_all)
    p2.goto(base + "/index.html", wait_until="commit")
    check("new context: loader visible again", p2.wait_for_selector("#nx-loader", timeout=9000, state="visible") is not None)
    ctx2.close()

    # ── 4. Slow 4G-ish server: milestones + status text sequence ────
    ctx3 = browser.new_context(viewport={"width": 1280, "height": 800})
    p3 = ctx3.new_page()
    p3.route("**/api/**", stub_api); p3.route("**/*", route_all)
    p3.goto(base_slow + "/index.html", wait_until="commit")
    seq = p3.evaluate("""() => new Promise((res) => {
        const texts = [], bars = [];
        let lt = null, lb = null;
        const iv = setInterval(() => {
            const l = document.getElementById('nx-loader');
            if (!l) { clearInterval(iv); res({ texts, bars }); return; }
            const t = document.querySelector('.nx-status').textContent;
            const n = +document.querySelector('.nx-bar').getAttribute('aria-valuenow');
            if (t !== lt) { texts.push([t, Math.round(performance.now())]); lt = t; }
            if (n !== lb) { bars.push([n, Math.round(performance.now())]); lb = n; }
        }, 100);
        setTimeout(() => { clearInterval(iv); res({ texts, bars }); }, 12000);
    })""")
    texts = [t for t, ms in seq["texts"]]
    print("   slow status seq:", json.dumps(seq["texts"]))
    print("   slow aria samples:", json.dumps(seq["bars"]))
    need = ["Starting up", "Loading fonts", "Loading assets", "Almost ready", "Ready"]
    idx = [texts.index(w) for w in need if w in texts]
    ordered = idx == sorted(idx) and len(idx) >= 2
    check("slow: status sequence in order", ordered, str(texts))
    bar_samples = [n for n, ms in seq["bars"]]
    check("slow: bar monotonic and < 100 before load", all(b2 >= b1 for b1, b2 in zip(bar_samples, bar_samples[1:])) and bar_samples[0] < 100, str(bar_samples[:9]))
    p3.wait_for_function("() => !document.getElementById('nx-loader') && !document.getElementById('nx-loader-css')", timeout=12000)
    check("slow: loader closes + CSS removed", True)
    ctx3.close()

    # ── 5. Direct hash URLs ─────────────────────────────────────────
    ctx4 = browser.new_context(viewport={"width": 1280, "height": 800})
    p4 = ctx4.new_page()
    p4.route("**/api/**", stub_api); p4.route("**/*", route_all)
    p4.goto(base + "/index.html#lounge", wait_until="domcontentloaded")
    p4.wait_for_function("() => !document.getElementById('nx-loader') && !document.getElementById('nx-loader-css')", timeout=6000)
    hs = p4.evaluate("""() => ({ lounge: document.getElementById('lounge').classList.contains('active'),
        home: document.getElementById('home').classList.contains('active'), tab: window.__nexusTab, hash: location.hash })""")
    check("#lounge active after curtain", hs["lounge"] and not hs["home"] and hs["tab"] == "lounge" and hs["hash"] == "#lounge", json.dumps(hs))
    p4.goto(base + "/index.html#about", wait_until="domcontentloaded")
    p4.wait_for_function("() => !document.getElementById('nx-loader')", timeout=6000)
    hs2 = p4.evaluate("() => ({ a: document.getElementById('about').classList.contains('active'), tab: window.__nexusTab })")
    check("#about active after curtain", hs2["a"] and hs2["tab"] == "about", json.dumps(hs2))
    check("no pageerror (hash runs)", len(errors) == 0, "; ".join(errors))
    ctx4.close()

    # ── 6. prefers-reduced-motion ───────────────────────────────────
    ctx5 = browser.new_context(viewport={"width": 1280, "height": 800}, reduced_motion="reduce")
    p5 = ctx5.new_page()
    p5.route("**/api/**", stub_api); p5.route("**/*", route_all)
    p5.goto(base + "/index.html", wait_until="commit")
    p5.wait_for_selector("#nx-loader", timeout=5000, state="visible")
    rm = p5.evaluate("""() => {
        const cs = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null; };
        const l = document.getElementById('nx-loader');
        return {
            shell: cs('.nx-logo-shell', 'animationName'), ring: cs('.nx-ring', 'animationName'),
            sweep: cs('.nx-sweep', 'animationName'), sheen: cs('.nx-sheen', 'animationName'),
            ringOpacity: cs('.nx-ring', 'opacity'),
            loaderFade: getComputedStyle(l).transitionDuration,
            panelTransform: cs('.nx-panel-top', 'transitionDuration'),
            status: (document.querySelector('.nx-status') || {}).textContent,
            barNow: document.querySelector('.nx-bar').getAttribute('aria-valuenow'),
            pct: document.getElementById('nx-loader-pct').textContent,
        };
    }""")
    check("RM: entrance/rings/sweep/sheen off", rm["shell"] == "none" and rm["ring"] == "none" and rm["sweep"] == "none" and rm["sheen"] == "none", json.dumps(rm))
    check("RM: loader quick-fade path active", float(str(rm["loaderFade"]).split(",")[0].strip().rstrip("s")) <= 0.151, rm["loaderFade"])
    p5.wait_for_function("() => !document.getElementById('nx-loader')", timeout=6000)
    ctx5.close()

    # ── 7. JS disabled: noscript hides loader, content intact ───────
    ctx6 = browser.new_context(viewport={"width": 1280, "height": 800}, java_script_enabled=False)
    p6 = ctx6.new_page()
    p6.route("**/api/**", stub_api); p6.route("**/*", route_all)
    p6.goto(base + "/index.html", wait_until="domcontentloaded")
    nojs = p6.evaluate("() => { const e = document.getElementById('nx-loader'); return e ? getComputedStyle(e).display === 'none' : true; }")
    content = p6.evaluate("() => !!document.querySelector('.nav') && !!(document.querySelector('h1') || document.querySelector('section'))")
    check("no-JS: loader hidden, content intact", nojs and content)
    ctx6.close()

    browser.close()

print()
print("RESULT:", "ALL PASS" if not FAIL else f"{len(FAIL)} FAILED -> {FAIL}")
