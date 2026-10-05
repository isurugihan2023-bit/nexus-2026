"""scripts/pull_auto_covers.py - pull bot-captured covers into git.

The VPS bot downloads Rich Presence artwork once per game into its local
auto/ dir and serves the bytes at /api/public/assets/<key>.jpg (sync
bridge only - browsers never fetch that host). This script copies new or
changed files into images/games/auto/ so the next commit + push deploys
them on Vercel as images/games/auto/<key>.jpg.

Usage:  python scripts/pull_auto_covers.py [bot_base]
Bot address resolution: CLI arg > BOT_PUBLIC_URL env > website
/api/bot-status-full discovery (HMAC-signed with HEARTBEAT_SECRET +
WEBSITE_URL env) > http://127.0.0.1:30038 dev.

This script NEVER commits - inspect, then git add/commit/push yourself.
"""

import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request
import uuid

try:
    import requests as _requests
except ImportError:
    _requests = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "images", "games", "auto")

DEV_BOT = "http://127.0.0.1:30038"


def _discover_via_website():
    """Ask the website where the bot is via the AUTHENTICATED status endpoint.

    GET /api/bot-status-full with an HMAC-SHA256 signature over
    "<timestamp>.<nonce>.bot-status-full" in x-bot-signature (+
    x-bot-timestamp / x-bot-nonce headers). The public /api/bot-status no
    longer exposes baseUrl (IP privacy), so unsigned callers get the
    minimal liveness shape only.
    """
    website = (os.getenv("WEBSITE_URL", "") or "").rstrip("/")
    secret = (os.getenv("HEARTBEAT_SECRET", "") or "").strip()
    if not website or not secret:
        return ""
    try:
        ts = int(time.time() * 1000)
        nonce = uuid.uuid4().hex[:16]
        msg = f"{ts}.{nonce}.bot-status-full"
        sig = hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()
        req = urllib.request.Request(
            website + "/api/bot-status-full",
            headers={
                "x-bot-timestamp": str(ts),
                "x-bot-nonce": nonce,
                "x-bot-signature": sig,
                "User-Agent": "Nexus-Heartbeat/1.0",
            },
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            data = json.loads(r.read().decode("utf-8"))
            if data.get("online") and data.get("baseUrl"):
                return str(data["baseUrl"]).rstrip("/")
    except Exception as e:  # noqa: BLE001 - operator tooling, report plainly
        print(f"Website discovery ({website}) failed: {e}")
    return ""


def _default_bot():
    return (
        (os.getenv("BOT_PUBLIC_URL", "") or "").rstrip("/")
        or _discover_via_website()
        or DEV_BOT
    )


def main(argv):
    if _requests is None:
        print("Missing 'requests' package - run: pip install requests")
        return 2
    # CLI arg > BOT_PUBLIC_URL env > website /api/bot-status > dev (see above).
    bot = (argv[1] if len(argv) > 1 else _default_bot()).rstrip("/")
    try:
        live = _requests.get(f"{bot}/api/public/live", timeout=15)
        live.raise_for_status()
        games = live.json().get("games", [])
    except Exception as e:  # noqa: BLE001 - one-time script, report plainly
        print(f"Could not read {bot}/api/public/live: {e}")
        return 2
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"{'game_key':<24} {'result'}")
    pulled = changed = 0
    for g in games:
        key = str((g or {}).get("game_key") or "").strip().lower()
        if not key:
            continue
        dest = os.path.join(OUT_DIR, f"{key}.jpg")
        try:
            r = _requests.get(f"{bot}/api/public/assets/{key}.jpg", timeout=15)
        except Exception as e:
            print(f"{key:<24} bridge error: {e}")
            continue
        if r.status_code == 404:
            print(f"{key:<24} not captured yet")
            continue
        if r.status_code != 200 or "image" not in r.headers.get("Content-Type", ""):
            print(f"{key:<24} HTTP {r.status_code} ({r.headers.get('Content-Type')})")
            continue
        old = None
        if os.path.isfile(dest):
            with open(dest, "rb") as f:
                old = f.read()
        if old == r.content:
            print(f"{key:<24} up to date")
            continue
        with open(dest, "wb") as f:
            f.write(r.content)
        pulled += 1
        changed += 1 if old is not None else 0
        print(f"{key:<24} {'updated' if old is not None else 'new'} "
              f"({len(r.content) // 1024} KB)")
    print(f"\nDone: {pulled} file(s) written ({changed} updated). NOT committed - "
          "run git add/commit/push yourself.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
