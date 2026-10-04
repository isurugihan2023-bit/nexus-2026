"""
backend/artwork.py - Local-first game cover resolution + RAWG download cache.

Order (never hotlink as the primary source):
  1. Curated local file: images/games/<game_key>.jpg (.png accepted).
  2. RAWG download cache: same paths, fetched once via backend/rawg.py when
     RAWG_API_KEY is set (fire-and-forget prefetch; failures are silent).
  3. Category SVG: images/games/cat-<slug>.svg (shipped in the repo).
  4. Generic images/games/fallback.svg ("Gaming" only as a last resort).

Website vs bot hosts: when this code runs from the website repo the website
static dir is used and web paths (images/games/...) are returned. On the VPS
bot host the same relative layout applies if backend/config/games.json was
uploaded next to backend/; otherwise NEXUS_ARTWORK_DIR (bot static dir) is
used and absolute public URLs (NEXUS_PUBLIC_BASE + /static/games/...) are
returned so the browser can load them without mixed-content issues.
"""

import logging
import os
import time
from typing import Dict, Optional

logger = logging.getLogger("nexus.artwork")

GENERIC_CATEGORIES = {"", "gaming", "live gaming", "unknown"}

CATEGORY_SVGS = {
    "tactical fps": "cat-tactical-fps.svg",
    "competitive fps": "cat-tactical-fps.svg",
    "battle royale": "cat-battle-royale.svg",
    "fivem roleplay": "cat-fivem.svg",
    "fivem studio": "cat-fivem.svg",
    "gta v / fivem": "cat-fivem.svg",
    "racing": "cat-racing.svg",
    "sim racing": "cat-racing.svg",
    "moba strategy": "cat-moba.svg",
    "moba arena": "cat-moba.svg",
    "action rpg": "cat-action-rpg.svg",
    "sandbox survival": "cat-sandbox.svg",
    "platform sandbox": "cat-platform.svg",
    "platform fighter": "cat-platform.svg",
    "sports": "cat-sports.svg",
    "sports racing": "cat-sports.svg",
}

FALLBACK_IMAGE = "images/games/fallback.svg"

_attempted: Dict[str, float] = {}
_ATTEMPT_TTL = 6 * 3600.0


def _repo_images_dir() -> Optional[str]:
    here = os.path.dirname(os.path.abspath(__file__))
    cand = os.path.join(os.path.dirname(here), "images", "games")
    return cand if os.path.isdir(cand) else None


def artwork_dir() -> str:
    """Writable dir for downloaded covers. Prefers the website static dir."""
    repo = _repo_images_dir()
    if repo:
        return repo
    d = os.getenv("NEXUS_ARTWORK_DIR", "static/games")
    os.makedirs(d, exist_ok=True)
    return d


def _web_path_for(local_file: str) -> str:
    repo = _repo_images_dir()
    if repo and os.path.abspath(local_file).startswith(os.path.abspath(repo)):
        return "images/games/" + os.path.basename(local_file)
    base = (os.getenv("NEXUS_PUBLIC_BASE", "https://ninjanexus.duckdns.org") or "").rstrip("/")
    return f"{base}/static/games/" + os.path.basename(local_file)


def category_image(category: str) -> str:
    name = CATEGORY_SVGS.get((category or "").strip().lower(), "")
    if name:
        repo = _repo_images_dir()
        if repo and os.path.isfile(os.path.join(repo, name)):
            return "images/games/" + name
        # Bot host without the website tree: absolute public URL keeps
        # covers loading (HTTPS, no mixed content, no CORS needed for <img>).
        base = (os.getenv("NEXUS_PUBLIC_BASE", "https://ninjanexus.duckdns.org") or "").rstrip("/")
        return f"{base}/static/games/" + name
    return FALLBACK_IMAGE


def image_for(game_key: str, category: str = "") -> str:
    """Best local cover for a game. Sync + fast (existence checks only)."""
    key = (game_key or "").strip().lower() or "unknown"
    d = artwork_dir()
    for ext in (".jpg", ".png"):
        cand = os.path.join(d, key + ext)
        if os.path.isfile(cand):
            return _web_path_for(cand)
    return category_image(category)


def is_generic_image(image: str) -> bool:
    return (image or "").strip().lower().endswith(("fallback.svg", "fallback.jpg"))


def should_prefetch(game_key: str, image: str) -> bool:
    if not os.getenv("RAWG_API_KEY", "").strip():
        return False
    if not is_generic_image(image) and not image.endswith((".svg",)):
        return False  # already a real cached cover
    now = time.monotonic()
    last = _attempted.get((game_key or "").lower())
    if last is not None and now - last < _ATTEMPT_TTL:
        return False
    _attempted[(game_key or "").lower()] = now
    return True


async def ensure_cached(game_key: str, game_name: str) -> Optional[str]:
    """Download the RAWG cover into the artwork dir. Never raises."""
    try:
        from .rawg import GameMetadataResolver  # local import: stdlib-only tests
    except Exception:
        return None
    key = (game_key or "").strip().lower() or "unknown"
    d = artwork_dir()
    for ext in (".jpg", ".png"):
        if os.path.isfile(os.path.join(d, key + ext)):
            return _web_path_for(os.path.join(d, key + ext))
    try:
        import aiohttp  # type: ignore
    except Exception:
        return None
    class _NoCache:
        @staticmethod
        def get_cached_game(name):
            return None

        @staticmethod
        def save_cached_game(*a, **k):
            return None

    try:
        resolver = GameMetadataResolver(db=_NoCache())  # type: ignore[arg-type]
        meta = await resolver.resolve(game_name or key)
        url = (meta or {}).get("cover_url", "")
        if not url or url.startswith("images/"):
            return None
        timeout = aiohttp.ClientTimeout(total=5.0)
        async with aiohttp.ClientSession(timeout=timeout) as sess:
            async with sess.get(url, headers={"User-Agent": "NinjaNexus/1.0"}) as resp:
                if resp.status != 200:
                    return None
                data = await resp.read()
        if len(data) < 2048 or len(data) > 8 * 1024 * 1024:
            return None
        dest = os.path.join(d, key + ".jpg")
        with open(dest, "wb") as f:
            f.write(data)
        logger.info("[ARTWORK] Cached cover for %s (%d bytes)", game_name, len(data))
        return _web_path_for(dest)
    except Exception as e:
        logger.debug("[ARTWORK] Prefetch failed for %s: %s", game_name, e)
        return None
