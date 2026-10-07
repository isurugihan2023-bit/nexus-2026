"""
backend/asset_capture.py - one-time download of captured Rich Presence artwork.

The bot remembers artwork URLs per game (game_assets table); this module
fetches the bytes ONCE and stores them as images/games/auto/<game_key>.jpg
so the website self-hosts them (never hotlinks Discord CDN URLs at runtime,
never emits absolute bot URLs to browsers).

Safety: only cdn.discordapp.com / media.discordapp.net, 3 s timeout,
500 KB cap, content-type must be image/*. Caller (VPS wiring) must skip
opted-out members BEFORE saving; this module never sees user IDs.

Requires Pillow for the 460x215 JPEG normalize (same spec as the manual
covers). Without it, capturing is skipped with a clear log line.
"""

import logging
import os
import re
from typing import Optional

logger = logging.getLogger("nexus.assets")

ASSET_HOSTS = ("cdn.discordapp.com", "media.discordapp.net")
DOWNLOAD_TIMEOUT_SECONDS = 3.0
MAX_DOWNLOAD_BYTES = 500 * 1024

TARGET_W, TARGET_H = 460, 215
TARGET_MAX_BYTES = 60 * 1024
TARGET_QUALITY = 80

SAFE_KEY_RE = re.compile(r"^[a-z0-9-]+$")


def resolve_dir(explicit: Optional[str] = None) -> str:
    """Where auto/ covers live. Env NEXUS_AUTO_ART_DIR wins (VPS layout),
    default matches this repo (images/games/auto)."""
    return explicit or os.getenv("NEXUS_AUTO_ART_DIR") or os.path.join(
        "images", "games", "auto")


def cover_path(images_dir: str, game_key: str) -> Optional[str]:
    key = str(game_key or "").strip().lower()
    if not SAFE_KEY_RE.fullmatch(key):
        return None
    return os.path.join(resolve_dir(images_dir), f"{key}.jpg")


def cover_exists(images_dir: str, game_key: str) -> bool:
    p = cover_path(images_dir, game_key)
    return bool(p) and os.path.isfile(p)


def _host_ok(url: str) -> bool:
    """Allowlisted https URL only (scheme + host checked together)."""
    if not str(url or "").lower().startswith("https://"):
        return False
    try:
        host = url.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0].lower()
    except Exception:
        return False
    return host in ASSET_HOSTS


def _normalize(raw: bytes) -> bytes:
    """Cover-fit to exactly 460x215, progressive JPEG under 60 KB."""
    from PIL import Image
    import io

    img = Image.open(io.BytesIO(raw)).convert("RGB")
    scale = max(TARGET_W / img.width, TARGET_H / img.height)
    resized = img.resize((round(img.width * scale) + 1,
                          round(img.height * scale) + 1), Image.LANCZOS)
    left = (resized.width - TARGET_W) // 2
    top = (resized.height - TARGET_H) // 2
    fitted = resized.crop((left, top, left + TARGET_W, top + TARGET_H))
    quality = TARGET_QUALITY
    while quality >= 40:
        buf = io.BytesIO()
        fitted.save(buf, "JPEG", quality=quality, optimize=True,
                    progressive=True)
        if len(buf.getvalue()) <= TARGET_MAX_BYTES or quality == 40:
            return buf.getvalue()
        quality -= 5
    raise AssertionError("unreachable")


async def ensure_game_cover(images_dir: str, game_key: str, image_url: str,
                            source_app_id: str = "",
                            force: bool = False) -> Optional[str]:
    """Download + normalize the captured artwork if not already saved.

    Pass force=True when the remembered URL changed (stale logo refresh).
    Returns the saved path, the existing path (already captured), or None
    (skipped / failed - never raises).
    """
    url = str(image_url or "").strip()
    if not url.lower().startswith("https://") or not _host_ok(url):
        return None
    dest = cover_path(images_dir, game_key)
    if not dest:
        return None
    if os.path.isfile(dest) and not force:
        return dest  # captured before; URL changes re-download via force=True
    try:
        import aiohttp
    except Exception:
        logger.warning("[ASSETS] aiohttp unavailable, skipping %s", game_key)
        return None
    try:
        timeout = aiohttp.ClientTimeout(total=DOWNLOAD_TIMEOUT_SECONDS)
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            async with sess.get(url, headers={"User-Agent": "ninja-nexus-asset-capture/1.0"}) as resp:
                if resp.status != 200:
                    logger.warning("[ASSETS] %s -> HTTP %s", game_key, resp.status)
                    return None
                ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                if not ctype.startswith("image/"):
                    logger.warning("[ASSETS] %s -> non-image %r", game_key, ctype)
                    return None
                try:
                    length = int(resp.headers.get("Content-Length") or 0)
                except Exception:
                    length = 0
                if length > MAX_DOWNLOAD_BYTES:
                    logger.warning("[ASSETS] %s -> %d bytes over cap", game_key, length)
                    return None
                chunks = []
                total = 0
                async for chunk in resp.content.iter_chunked(65536):
                    chunks.append(chunk)
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        logger.warning("[ASSETS] %s -> over cap while reading", game_key)
                        return None
                raw = b"".join(chunks)
        try:
            data = _normalize(raw)
        except ImportError:
            logger.warning("[ASSETS] Pillow missing - pip install Pillow to capture %s", game_key)
            return None
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, "wb") as f:
            f.write(data)
        logger.info("[ASSETS] captured %s (%d KB) app=%s", game_key,
                    len(data) // 1024, source_app_id or "-")
        return dest
    except Exception as e:
        logger.warning("[ASSETS] capture failed for %s: %s", game_key, e)
        return None
