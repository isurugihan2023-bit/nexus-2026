"""backend/tests/test_dashboard_public_url.py - BATCH LINK1 regression guard.

Public dashboard links must use the panel's public HTTPS URL (no port).
Browsers upgrade the old http panel-host-on-port-3000 URL to https on
port 3000 (plain-HTTP port) and fail with ERR_SSL_PROTOCOL_ERROR.

Canonical public URL (single source of truth for tests; server-side code
should build URLs from env DASHBOARD_PUBLIC_URL with this default):
    DASHBOARD_PUBLIC_URL=https://panelnexus.duckdns.org/dashboard

Checks (static, no network):
  1. No template/JS/py/config contains the bad host+port (see BAD_HOSTPORT).
  2. index.html Dashboard anchors use the canonical https URL (no port).
  3. vercel.json /dashboard redirects point at the canonical https URL.

NOTE: BAD_HOSTPORT is built by concatenation so a raw grep for the bad
URL does not match this guard file itself.

Run: python -m pytest backend/tests/test_dashboard_public_url.py -v
"""
import json
import os
import re

# Canonical public dashboard URL. Server-side builders (OAuth redirect,
# post-login redirect, bot embeds) must use
# os.getenv("DASHBOARD_PUBLIC_URL", DASHBOARD_PUBLIC_URL).
DASHBOARD_PUBLIC_URL = os.getenv(
    "DASHBOARD_PUBLIC_URL", "https://panelnexus.duckdns.org/dashboard")

BAD_HOSTPORT = "panelnexus.duckdns.org" + ":3000"

# Repo root = <repo>/ (tests live in <repo>/backend/tests/).
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# Text files to scan; skip binaries, venv, caches, images, logs.
SCAN_EXTS = {".html", ".js", ".py", ".json", ".md", ".txt",
             ".conf", ".service", ".xml", ".css"}
SKIP_DIRS = {".venv", "__pycache__", ".git", "node_modules",
             ".phase1_audit_site", ".phase2_site", "images", "assets",
             "logs", ".freebuff"}


def _iter_files():
    self_file = os.path.abspath(__file__)
    for dirpath, dirnames, filenames in os.walk(REPO_ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS
                       and not d.startswith("shots_")
                       and not d.startswith("e2e_shots")]
        for fn in filenames:
            _, ext = os.path.splitext(fn)
            if ext.lower() in SCAN_EXTS:
                full = os.path.join(dirpath, fn)
                # Skip this guard file itself (it names the bad pattern).
                if os.path.abspath(full) == self_file:
                    continue
                yield full


def test_no_panel_port3000():
    """No template/JS/py/config may contain the bad panel host+port."""
    offenders = []
    for path in _iter_files():
        try:
            with open(path, encoding="utf-8", errors="strict") as fh:
                for lineno, line in enumerate(fh, 1):
                    if BAD_HOSTPORT in line:
                        offenders.append(
                            "%s:%d: %s" % (
                                os.path.relpath(path, REPO_ROOT),
                                lineno, line.strip()[:200]))
        except (OSError, UnicodeDecodeError):
            continue
    assert not offenders, \
        "found %s in:\n%s" % (BAD_HOSTPORT, "\n".join(offenders))


def test_dashboard_anchors_use_https_no_port():
    """index.html Dashboard anchors must use the canonical https URL."""
    path = os.path.join(REPO_ROOT, "index.html")
    with open(path, encoding="utf-8") as fh:
        html = fh.read()
    hrefs = re.findall(
        r'<a\s[^>]*href="([^"]+)"[^>]*>\s*Dashboard\s*</a>', html)
    assert hrefs, "no Dashboard anchors found in index.html"
    for href in hrefs:
        assert href == DASHBOARD_PUBLIC_URL, \
            "Dashboard href %r != canonical %r" % (href, DASHBOARD_PUBLIC_URL)
        assert ":3000" not in href
        assert href.startswith("https://")


def test_vercel_dashboard_redirects_use_https_no_port():
    """vercel.json /dashboard redirects must target the canonical URL."""
    path = os.path.join(REPO_ROOT, "vercel.json")
    with open(path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    dests = [r.get("destination", "") for r in cfg.get("redirects", [])
             if r.get("source", "").startswith("/dashboard")]
    assert dests, "no /dashboard redirects in vercel.json"
    for dest in dests:
        assert dest == DASHBOARD_PUBLIC_URL, \
            "vercel redirect %r != canonical %r" % (dest, DASHBOARD_PUBLIC_URL)


def main():
    test_no_panel_port3000()
    print("[TEST] no bad panel host+port [OK]")
    test_dashboard_anchors_use_https_no_port()
    print("[TEST] index.html Dashboard hrefs canonical [OK]")
    test_vercel_dashboard_redirects_use_https_no_port()
    print("[TEST] vercel.json /dashboard redirects canonical [OK]")
    print("[TEST] ALL DASHBOARD URL TESTS PASSED [OK]")


if __name__ == "__main__":
    main()
