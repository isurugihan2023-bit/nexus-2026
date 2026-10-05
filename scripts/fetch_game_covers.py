"""scripts/fetch_game_covers.py - one-time self-hosted cover fetcher.

For each real Steam game in STEAM_COVERS, downloads the official Steam
store header image (https://cdn.cloudflare.steamstatic.com/steam/apps/<appid>/header.jpg),
normalizes it to 460x215 JPEG (<60 KB) and saves it as
images/games/<game_key>.jpg so the site self-hosts covers
(never hotlinked at runtime).

Non-games (freebuff, bluestacks-5) are intentionally SKIPPED - they keep
category art. Non-Steam games (valorant, wuthering-waves, f1-25,
ceylon-roleplay) have no legitimateBulk-download source here and must be
supplied manually - see MANUAL_COVERS printed by this script.

Usage:  python scripts/fetch_game_covers.py
"""

import io
import os
import sys

import requests
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "images", "games")

TARGET_W, TARGET_H = 460, 215
MAX_BYTES = 60 * 1024

# game_key -> Steam appid. Keys are the REAL values from
# /api/public/live and /api/public/most-played (verified 2026-10-05).
# f1-25 (appid 3059520) is deliberately absent: the Steam image CDNs
# return 404 for every art path of that appid (header/capsule/hero).
STEAM_COVERS = {
    "pubg-battlegrounds": 578080,   # PUBG: BATTLEGROUNDS
    "brawlhalla": 291550,           # Brawlhalla
    "dota-2": 570,                  # Dota 2
}

# game_key -> why it must be supplied by hand.
MANUAL_COVERS = {
    "valorant": "not on Steam (Riot client) - no legitimate bulk source",
    "wuthering-waves": "not on Steam - no legitimate bulk source",
    "f1-25": "Steam appid 3059520 exists but all CDN art paths 404",
    "ceylon-roleplay": "custom FiveM server art - use the community logo",
}

# Non-games: never get real covers, category art stays.
SKIPPED_NON_GAMES = ("freebuff", "bluestacks-5")


def download_header(appid: int) -> bytes:
    url = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
    r = requests.get(url, timeout=30, headers={"User-Agent": "ninja-nexus-cover-fetch/1.0"})
    r.raise_for_status()
    ctype = r.headers.get("Content-Type", "")
    if "image" not in ctype:
        raise ValueError(f"{url} returned Content-Type {ctype!r}")
    if len(r.content) < 4096:
        raise ValueError(f"{url} returned only {len(r.content)} bytes")
    return r.content


def normalize(raw: bytes) -> bytes:
    """Cover-fit to exactly 460x215, JPEG under MAX_BYTES."""
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # Cover-fit: scale so both axes fill, then center-crop.
    scale = max(TARGET_W / img.width, TARGET_H / img.height)
    resized = img.resize((round(img.width * scale) + 1, round(img.height * scale) + 1), Image.LANCZOS)
    left = (resized.width - TARGET_W) // 2
    top = (resized.height - TARGET_H) // 2
    fitted = resized.crop((left, top, left + TARGET_W, top + TARGET_H))
    quality = 85
    while quality >= 40:
        buf = io.BytesIO()
        fitted.save(buf, "JPEG", quality=quality, optimize=True, progressive=True)
        if len(buf.getvalue()) <= MAX_BYTES or quality == 40:
            return buf.getvalue()
        quality -= 5
    raise AssertionError("unreachable")


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"{'game_key':<20} {'source':<38} {'result'}")
    failed = 0
    for key, appid in STEAM_COVERS.items():
        dest = os.path.join(OUT_DIR, f"{key}.jpg")
        try:
            data = normalize(download_header(appid))
            with open(dest, "wb") as f:
                f.write(data)
            print(f"{key:<20} steam:{appid:<31} OK {len(data)//1024} KB")
        except Exception as e:  # noqa: BLE001 - one-time script, report and continue
            failed += 1
            print(f"{key:<20} steam:{appid:<31} FAILED {e}")
    print("\nSkipped non-games (keep category art): " + ", ".join(SKIPPED_NON_GAMES))
    print("Supply manually as images/games/<game_key>.jpg (460x215, <60 KB):")
    for key, reason in MANUAL_COVERS.items():
        print(f"  - {key}.jpg: {reason}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
