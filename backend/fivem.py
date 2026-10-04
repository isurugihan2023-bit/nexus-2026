"""
backend/fivem.py - Ceylon Roleplay (FiveM) live player-count lookup.

Fetches the public FiveM server info endpoint with a short timeout,
caches the result for 15 seconds, and falls back gracefully (None)
when unreachable. Never blocks the bot event loop: callers must use
the async helper with their own session/timeout budget.
"""

import logging
import os
import time
from typing import Any, Dict, Optional

logger = logging.getLogger("nexus.fivem")

_cache: Dict[str, Any] = {"at": 0.0, "value": None}

CACHE_SECONDS = 15


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


async def fetch_player_count(session=None, address: str = "") -> Optional[Dict[str, int]]:
    """Return {current, max} or None. Short timeout, 15s cache, never raises."""
    global _cache
    now = time.monotonic()
    if now - float(_cache.get("at", 0)) < CACHE_SECONDS and _cache.get("value") is not None:
        return _cache["value"]
    addr = (address or server_address()).strip()
    if not addr:
        return None
    timeout_s = float(os.getenv("FIVEM_TIMEOUT_SECONDS", "3") or 3)
    urls = _candidate_urls(addr)
    result: Optional[Dict[str, int]] = None
    try:
        import aiohttp
        own = session is None
        sess = session or aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=min(4.0, timeout_s)))
        try:
            for url in urls:
                try:
                    async with sess.get(url) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json()
                        if isinstance(data, dict):
                            cur = data.get("clients") or data.get("current") or len(data.get("players", []) or [])
                            mx = data.get("sv_maxclients") or data.get("max") or data.get("maxClients")
                            if cur is not None:
                                result = {"current": int(cur), "max": int(mx) if mx else 100}
                                break
                        elif isinstance(data, list):
                            result = {"current": len(data), "max": 100}
                            break
                except Exception:
                    continue
        finally:
            if own:
                await sess.close()
    except Exception as e:  # never break the API on FiveM outage
        logger.debug("[FiveM] lookup failed: %s", e)
        result = None
    _cache = {"at": now, "value": result}
    return result
