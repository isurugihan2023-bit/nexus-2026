"""scripts/pull_auto_covers.py - pull bot-captured covers into git.

The VPS bot downloads Rich Presence artwork once per game into its local
auto/ dir and serves the bytes at /api/public/assets/<key>.jpg (sync
bridge only - browsers never fetch that host). This script copies new or
changed files into images/games/auto/ so the next commit + push deploys
them on Vercel as images/games/auto/<key>.jpg.

Usage:  python scripts/pull_auto_covers.py [bot_base]
Default bot_base: http://157.90.181.183:23063

This script NEVER commits - inspect, then git add/commit/push yourself.
"""

import os
import sys

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "images", "games", "auto")

DEFAULT_BOT = "http://157.90.181.183:23063"


def main(argv):
    bot = (argv[1] if len(argv) > 1 else DEFAULT_BOT).rstrip("/")
    try:
        live = requests.get(f"{bot}/api/public/live", timeout=15)
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
            r = requests.get(f"{bot}/api/public/assets/{key}.jpg", timeout=15)
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
