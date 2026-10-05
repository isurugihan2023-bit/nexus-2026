"""
backend/fivem.py - Ceylon Roleplay (FiveM) live player-count lookup.

Blocking network I/O lives in fetch_player_count_sync (urllib, 2s timeout)
so callers can run it in an executor via asyncio.to_thread without ever
stalling the event loop. Results are cached 15-30s and the previous good
value is kept when a lookup fails, so a FiveM outage never blanks the card.
"""

import asyncio
import json
import logging
import os
import time
import urllib.request
from typing import Any, Dict, Optional

logger = logging.getLogger("nexus.fivem")

_cache: Dict[str, Any] = {"at": 0.0, "value": None}

MIN_CACHE_SECONDS = 15
MAX_CACHE_SECONDS = 30
FETCH_TIMEOUT_SECONDS = 2.0


def cache_seconds() -> int:
    """FiveM count cache TTL, clamped to [15, 30]s.

    Reads backend/config/games.json fivem_server.cache_seconds (default 15);
    NEXUS_FIVEM_CACHE_SECONDS overrides it.
    """
    raw = (os.getenv("NEXUS_FIVEM_CACHE_SECONDS", "") or "").strip()
    try:
        if raw:
            return max(MIN_CACHE_SECONDS, min(MAX_CACHE_SECONDS, int(raw)))
    except Exception:
        pass
    try:
        from .game_tracker import load_tracker_config
        cfg = load_tracker_config()
        val = int(((cfg.get("fivem_server") or {}).get("cache_seconds")) or 15)
        return max(MIN_CACHE_SECONDS, min(MAX_CACHE_SECONDS, val))
    except Exception:
        return MIN_CACHE_SECONDS


def server_address() -> str:
    return (os.getenv("FIVEM_SERVER_ADDRESS", "") or "").strip()


def _candidate_urls(addr: str):
    addr = addr.strip().rstrip("/")
    if not addr:
        return []
    if addr.startswith("http"):
        base = addr
    elif ":" in addr:
        host, _, port = addr.partition(":")
        base = f"http://{host}:{port or '30120'}"
    else:
        base = f"http://{addr}:30120"
    return [f"{base}/dynamic.json", f"{base}/info.json", f"{base}/players.json"]


def _parse_count(data: Any) -> Optional[Dict[str, int]]:
    try:
        if isinstance(data, dict):
            cur = data.get("clients") or data.get("current") or len(data.get("players", []) or [])
            mx = data.get("sv_maxclients") or data.get("max") or data.get("maxClients")
            if cur is not None:
                return {"current": int(cur), "max": int(mx) if mx else 100}
        elif isinstance(data, list):
            return {"current": len(data), "max": 100}
    except Exception:
        pass
    return None


def _http_get_json(url: str) -> Optional[Any]:
    req = urllib.request.Request(url, headers={"User-Agent": "NinjaNexus/1.0"})
    with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS) as resp:
        if resp.status != 200:
            return None
        return json.loads(resp.read().decode("utf-8", "replace"))


def fetch_player_count_sync(address: str = "") -> Optional[Dict[str, int]]:
    """Blocking lookup for executor use. Never raises; keeps previous value.

    Fresh cache (< TTL) is returned without network. Otherwise one lookup is
    attempted; on success the cache is updated, on failure the previous good
    value (possibly older than TTL) is returned instead of None.
    """
    global _cache
    now = time.monotonic()
    ttl = cache_seconds()
    if now - float(_cache.get("at", 0)) < ttl and _cache.get("value") is not None:
        return _cache["value"]
    addr = (address or server_address()).strip()
    if not addr:
        return _cache.get("value")
    result: Optional[Dict[str, int]] = None
    for url in _candidate_urls(addr):
        try:
            result = _parse_count(_http_get_json(url))
        except Exception:
            result = None
        if result is not None:
            break
    if result is not None:
        _cache = {"at": now, "value": result}
        return result
    logger.debug("[FiveM] lookup failed, keeping previous value: %s", _cache.get("value"))
    return _cache.get("value")


async def fetch_player_count(session=None, address: str = "") -> Optional[Dict[str, int]]:
    """Async wrapper (kept for compatibility). Never blocks the event loop."""
    _ = session  # sync core owns its connections; no shared session needed
    return await asyncio.to_thread(fetch_player_count_sync, address)
