"""asset_capture.py - FLAT-LAYOUT host file (upload next to dashboard.py).

Self-contained Rich Presence artwork capture. Duck-typed (no discord.py
import, no backend/ package, no live_store dependency):

  iter_playing_assets(member) -> (game_key, game_name, assets) per
      playing/competing activity that carries usable art. game_key uses
      the SAME slug rules as the website, so auto/<key>.jpg always lines
      up with the cards.
  ensure_game_cover(...)      -> download once (3 s timeout, 500 KB cap,
      image/* only, discord hosts only), normalize to 460x215 JPEG <60 KB,
      save as images/games/auto/<game_key>.jpg.

Top-level imports are stdlib only. aiohttp / Pillow are imported lazily
inside ensure_game_cover; without them capturing is skipped with a log.
"""

import logging
import os
import re

logger = logging.getLogger("nexus.assets")

ASSET_HOSTS = ("cdn.discordapp.com", "media.discordapp.net")
DOWNLOAD_TIMEOUT_SECONDS = 3.0
MAX_DOWNLOAD_BYTES = 500 * 1024

TARGET_W, TARGET_H = 460, 215
TARGET_MAX_BYTES = 60 * 1024
TARGET_QUALITY = 80

SAFE_KEY_RE = re.compile(r"^[a-z0-9-]+$")


def _slug(name):
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"


def game_key_for(name, details="", state=""):
    """(game_key, display_name) with the website's rules: FiveM servers
    advertising Ceylon collapse to ceylon-roleplay, else slug of name."""
    raw = (name or "").strip()
    if "ceylon" in f"{raw} {details or ''} {state or ''}".lower():
        return ("ceylon-roleplay", "Ceylon Roleplay")
    return (_slug(raw), raw or "Unknown")


def _activity_kind(act):
    t = getattr(act, "type", None)
    try:
        v = int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
    except Exception:
        v = None
    if v == 0:
        return "playing"
    if v == 5:
        return "competing"
    name = str(t).lower() if t is not None else ""
    if "competing" in name:
        return "competing"
    if "playing" in name:
        return "playing"
    return name


def _asset_direct_url(app_id, asset):
    """One raw activity asset value -> allowlisted https URL or None."""
    raw = str(asset or "").strip()
    if not raw or raw.startswith("spotify:"):
        return None
    if raw.startswith("mp:"):
        return "https://media.discordapp.net/" + raw[3:].lstrip("/")
    low = raw.lower()
    if low.startswith("https://"):
        host = low.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
        return raw if host in ASSET_HOSTS else None
    if low.startswith("http://"):
        return None  # plain http never accepted, even on CDN hosts
    try:
        aid = str(getattr(app_id, "id", app_id) or "").strip()
    except Exception:
        aid = ""
    if not aid or not re.fullmatch(r"[A-Za-z0-9_-]+", raw):
        return None
    return "https://cdn.discordapp.com/app-assets/%s/%s.png" % (aid, raw)


def extract_activity_assets(act):
    """{'large': url|None, 'small': url|None, 'app_id': str} or None."""
    if act is None:
        return None
    app_id = getattr(act, "application_id", None)
    try:
        app_str = str(getattr(app_id, "id", app_id) or "").strip()
    except Exception:
        app_str = ""
    large = small = None
    assets = getattr(act, "assets", None)
    if isinstance(assets, dict):
        large = _asset_direct_url(app_id, assets.get("large_image"))
        small = _asset_direct_url(app_id, assets.get("small_image"))
    if not large:
        direct = _asset_direct_url(app_id, getattr(act, "large_image_url", None))
        if direct:
            large = direct
    if not small:
        direct = _asset_direct_url(app_id, getattr(act, "small_image_url", None))
        if direct:
            small = direct
    if not (large or small):
        return None
    return {"large": large, "small": small, "app_id": app_str}


def iter_playing_assets(member):
    """Yield (game_key, game_name, assets) for art-carrying game activities."""
    if member is None or bool(getattr(member, "bot", False)):
        return
    for act in getattr(member, "activities", None) or []:
        if _activity_kind(act) not in ("playing", "competing"):
            continue
        name = (getattr(act, "name", None) or "").strip()
        if not name or name.lower() in ("custom status", "customstatus", "spotify"):
            continue
        assets = extract_activity_assets(act)
        if not assets:
            continue
        key, display = game_key_for(name, getattr(act, "details", ""),
                                    getattr(act, "state", ""))
        yield key, display, assets


def resolve_dir(explicit=None):
    """Auto-cover staging dir. Env NEXUS_AUTO_ART_DIR wins; default is
    images/games/auto under the bot's working dir (on Bot-Hosting this is
    /home/container, so the default already lands in the right place)."""
    return explicit or os.getenv("NEXUS_AUTO_ART_DIR") or os.path.join(
        "images", "games", "auto")


def cover_path(images_dir, game_key):
    key = str(game_key or "").strip().lower()
    if not SAFE_KEY_RE.fullmatch(key):
        return None
    return os.path.join(resolve_dir(images_dir), "%s.jpg" % key)


def cover_exists(images_dir, game_key):
    p = cover_path(images_dir, game_key)
    return bool(p) and os.path.isfile(p)


def _normalize(raw):
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


async def ensure_game_cover(images_dir, game_key, image_url,
                            source_app_id="", force=False):
    """Download + normalize if not already saved (force=True refreshes a
    changed URL). Returns path or None. Never raises."""
    url = str(image_url or "").strip()
    if not url.lower().startswith("https://"):
        return None
    try:
        host = url.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0].lower()
    except Exception:
        return None
    if host not in ASSET_HOSTS:
        return None
    dest = cover_path(images_dir, game_key)
    if not dest:
        return None
    if os.path.isfile(dest) and not force:
        return dest
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
                chunks, total = [], 0
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
            logger.warning("[ASSETS] Pillow missing - add Pillow to requirements.txt to capture %s",
                           game_key)
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
