"""
backend/public_api.py - Public read-only API for the NEXUS website LIVE page.

Routes (additive, existing endpoints untouched):
  GET /api/public/live                  -> live games grouped by game
  GET /api/public/most-played?range=7d  -> per-GAME ranking, last N days (top 9)
  GET /api/public/live/stream           -> SSE stream of the live payload

Safety: per-IP rate limit, in-memory cache (live 5s / most-played 60s),
ETag/304, strict CORS allow-list (env NEXUS_WEBSITE_ORIGINS, no wildcard),
input validation, no Discord IDs / tokens in responses, short timeouts and
DB access off the event loop (asyncio.to_thread) so slow clients never block.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

from aiohttp import web

logger = logging.getLogger("nexus.public_api")


def _allowed_origins() -> List[str]:
    raw = os.getenv("NEXUS_WEBSITE_ORIGINS",
                    "https://ninjanexus.duckdns.org,https://nexus-2026.vercel.app")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def _cors_headers(request: web.Request) -> Dict[str, str]:
    origin = (request.headers.get("Origin") or "").strip().rstrip("/")
    allowed = _allowed_origins()
    headers: Dict[str, str] = {"Vary": "Origin, Accept-Encoding"}
    if origin and origin in allowed:
        headers["Access-Control-Allow-Origin"] = origin
    elif not origin:
        # Same-origin / curl: allow the primary website origin for caching proxies.
        headers["Access-Control-Allow-Origin"] = allowed[0] if allowed else ""
    # else: unlisted origin -> no ACAO header (browser blocks, curl still reads)
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    headers["Access-Control-Allow-Headers"] = "Content-Type, If-None-Match"
    headers["Access-Control-Max-Age"] = "600"
    return headers


def _avatar64(url: str) -> str:
    u = (url or "").strip() or "https://cdn.discordapp.com/embed/avatars/0.png"
    if "cdn.discordapp.com" in u:
        base = u.split("?")[0]
        return f"{base}?size=64"
    return u


def _game_meta(game_key: str) -> Dict[str, str]:
    try:
        from .game_tracker import load_tracker_config
        cfg = load_tracker_config()
        meta = (cfg.get("metadata") or {}).get((game_key or "").lower(), {})
        fb = cfg.get("fallback") or {}
        return {
            "category": str(meta.get("category") or "Gaming"),
            "image": str(meta.get("image") or fb.get("image") or "images/games/fallback.svg"),
        }
    except Exception:
        return {"category": "Gaming", "image": "images/games/fallback.svg"}


def _parse_range(value: str) -> int:
    v = (value or "7d").strip().lower()
    mapping = {"7d": 7, "week": 7, "30d": 30, "month": 30,
               "all": 30, "24h": 1, "day": 1, "1d": 1}
    days = mapping.get(v, 7)
    return days * 86400 * 1000


class PublicApiRouter:
    def __init__(self, db, fivem_address: str = ""):
        self.db = db
        self.fivem_address = fivem_address or os.getenv("FIVEM_SERVER_ADDRESS", "")
        self._live_cache: Dict[str, Any] = {"at": 0.0, "etag": "", "body": None}
        self._mp_cache: Dict[str, Any] = {}
        self._hits: Dict[str, List[float]] = {}
        self._limit = int(os.getenv("NEXUS_PUBLIC_RATELIMIT", "120"))
        self._window = 60.0

    def invalidate_live(self):
        self._live_cache = {"at": 0.0, "etag": "", "body": None}

    # ── helpers ──
    def _rate_limited(self, request: web.Request) -> bool:
        ip = request.headers.get("X-Forwarded-For", request.remote or "?").split(",")[0].strip()
        now = time.monotonic()
        bucket = self._hits.setdefault(ip, [])
        while bucket and now - bucket[0] > self._window:
            bucket.pop(0)
        if len(bucket) >= self._limit:
            return True
        bucket.append(now)
        return False

    def _etag(self, body: bytes) -> str:
        return '"' + hashlib.sha256(body).hexdigest()[:32] + '"'

    def _json(self, request: web.Request, payload: Dict[str, Any],
              cache_control: str) -> web.Response:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        etag = self._etag(body)
        if request.headers.get("If-None-Match") == etag:
            resp = web.Response(status=304)
            resp.headers["ETag"] = etag
            resp.headers["Cache-Control"] = cache_control
            for k, v in _cors_headers(request).items():
                resp.headers[k] = v
            return resp
        resp = web.Response(body=body, content_type="application/json")
        resp.headers["ETag"] = etag
        resp.headers["Cache-Control"] = cache_control
        for k, v in _cors_headers(request).items():
            if v:
                resp.headers[k] = v
        return resp

    async def _options(self, request: web.Request) -> web.Response:
        resp = web.Response(status=204)
        for k, v in _cors_headers(request).items():
            if v:
                resp.headers[k] = v
        return resp

    # ── payload builders (DB off the event loop) ──
    async def _build_live(self) -> Dict[str, Any]:
        rows = await asyncio.to_thread(self.db.get_open_game_sessions)
        try:
            optouts = set(await asyncio.to_thread(self.db.get_privacy_optouts))
        except Exception:
            optouts = set()
        grouped: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            if str(r.get("user_id")) in optouts:
                continue
            key = str(r.get("game_key") or "unknown")
            g = grouped.setdefault(key, {"game_key": key,
                                         "name": str(r.get("game_name") or key),
                                         "players": []})
            g["players"].append({
                "name": str(r.get("username") or "Member"),
                "avatar": _avatar64(str(r.get("avatar_url") or "")),
                "details": str(r.get("details") or "")[:140],
                "state": str(r.get("state") or "")[:140],
                "since": int(r.get("started_at") or 0),
            })
        server_players = None
        if "ceylon-roleplay" in grouped:
            try:
                from .fivem import fetch_player_count
                got = await asyncio.wait_for(
                    fetch_player_count(address=self.fivem_address), timeout=3.5)
                if got:
                    server_players = {"current": int(got["current"]),
                                      "max": int(got.get("max") or 100)}
            except Exception:
                server_players = None
        games = []
        for key in sorted(grouped, key=lambda k: len(grouped[k]["players"]), reverse=True):
            g = grouped[key]
            g["players"].sort(key=lambda p: p["name"].lower())
            meta = _game_meta(key)
            games.append({
                "game_key": key, "name": g["name"],
                "category": meta["category"], "image": meta["image"],
                "server_players": server_players if key == "ceylon-roleplay" else None,
                "players": g["players"], "player_count": len(g["players"]),
            })
        return {"generated_at": int(time.time() * 1000), "games": games,
                "total_playing": sum(g["player_count"] for g in games)}

    async def _build_most_played(self, range_ms: int, range_label: str) -> Dict[str, Any]:
        rows = await asyncio.to_thread(
            self.db.get_game_most_played, range_ms, 9)
        games = []
        for r in rows:
            meta = _game_meta(str(r.get("game_key") or ""))
            top = [{"name": str(p.get("name") or "Member"),
                     "avatar": _avatar64(str(p.get("avatar") or ""))}
                   for p in (r.get("top_players") or [])[:4]]
            games.append({
                "rank": int(r.get("rank") or 0),
                "game_key": str(r.get("game_key") or ""),
                "name": str(r.get("name") or ""),
                "category": meta["category"], "image": meta["image"],
                "unique_players": int(r.get("unique_players") or 0),
                "total_hours": float(r.get("total_hours") or 0),
                "top_players": top,
            })
        return {"generated_at": int(time.time() * 1000),
                "range": range_label, "games": games}

    # ── routes ──
    async def get_live(self, request: web.Request) -> web.Response:
        if request.method == "OPTIONS":
            return await self._options(request)
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        now = time.monotonic()
        if now - float(self._live_cache.get("at", 0)) < 5.0 and self._live_cache.get("body") is not None:
            if request.headers.get("If-None-Match") == self._live_cache.get("etag"):
                resp = web.Response(status=304)
                resp.headers["ETag"] = self._live_cache.get("etag", "")
                resp.headers["Cache-Control"] = "public, max-age=5"
                for k, v in _cors_headers(request).items():
                    if v:
                        resp.headers[k] = v
                return resp
            body = self._live_cache["body"]
            etag = self._live_cache["etag"]
            resp = web.Response(body=body, content_type="application/json")
            resp.headers["ETag"] = etag
            resp.headers["Cache-Control"] = "public, max-age=5"
            for k, v in _cors_headers(request).items():
                if v:
                    resp.headers[k] = v
            return resp
        try:
            payload = await asyncio.wait_for(self._build_live(), timeout=8.0)
        except asyncio.TimeoutError:
            return web.json_response({"error": "timeout"}, status=504)
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self._live_cache = {"at": now, "etag": self._etag(raw), "body": raw}
        return self._json(request, payload, "public, max-age=5")

    async def get_most_played(self, request: web.Request) -> web.Response:
        if request.method == "OPTIONS":
            return await self._options(request)
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        raw_range = (request.query.get("range")
                     or request.query.get("period") or "7d")
        if raw_range not in ("7d", "week", "30d", "month", "all", "24h", "day", "1d"):
            return web.json_response({"error": "bad range (7d|30d|all)"}, status=400)
        label = {"week": "7d", "month": "30d", "all": "30d",
                 "day": "24h", "1d": "24h"}.get(raw_range, raw_range)
        range_ms = _parse_range(raw_range)
        now = time.monotonic()
        hit = self._mp_cache.get(label)
        if hit and now - float(hit.get("at", 0)) < 60.0:
            resp = web.Response(body=hit["body"], content_type="application/json")
            resp.headers["ETag"] = hit["etag"]
            resp.headers["Cache-Control"] = "public, max-age=60"
            for k, v in _cors_headers(request).items():
                if v:
                    resp.headers[k] = v
            if request.headers.get("If-None-Match") == hit["etag"]:
                return web.Response(status=304, headers={"ETag": hit["etag"]})
            return resp
        try:
            payload = await asyncio.wait_for(self._build_most_played(range_ms, label), timeout=8.0)
        except asyncio.TimeoutError:
            return web.json_response({"error": "timeout"}, status=504)
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self._mp_cache[label] = {"at": now, "etag": self._etag(raw), "body": raw}
        return self._json(request, payload, "public, max-age=60")

    async def live_stream(self, request: web.Request) -> web.Response:
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        resp = web.StreamResponse()
        resp.content_type = "text/event-stream"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["Connection"] = "keep-alive"
        resp.headers["X-Accel-Buffering"] = "no"
        for k, v in _cors_headers(request).items():
            if v:
                resp.headers[k] = v
        await resp.prepare(request)
        last_etag = ""
        try:
            async def send(payload: Dict[str, Any]):
                data = json.dumps(payload, separators=(",", ":"))
                await resp.write(f"data: {data}\n\n".encode("utf-8"))

            payload = await asyncio.wait_for(self._build_live(), timeout=8.0)
            raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            last_etag = self._etag(raw)
            await send(payload)
            for _ in range(150):  # ~50 min max per connection
                await asyncio.sleep(20)
                try:
                    await resp.write(b": heartbeat\n\n")
                except Exception:
                    break
                # Rebuild; only push when changed.
                try:
                    fresh = await asyncio.wait_for(self._build_live(), timeout=8.0)
                except Exception:
                    continue
                etag = self._etag(json.dumps(fresh, separators=(",", ":")).encode("utf-8"))
                if etag != last_etag:
                    last_etag = etag
                    try:
                        await send(fresh)
                    except Exception:
                        break
        except (asyncio.CancelledError, ConnectionResetError):
            pass
        finally:
            try:
                await resp.write_eof()
            except Exception:
                pass
        return resp

    def attach_routes(self, app: web.Application, bot_guilds_provider=None):
        app.router.add_route("OPTIONS", "/api/public/live", self._options)
        app.router.add_get("/api/public/live", self.get_live)
        app.router.add_route("OPTIONS", "/api/public/most-played", self._options)
        app.router.add_get("/api/public/most-played", self.get_most_played)
        app.router.add_get("/api/public/live/stream", self.live_stream)
        logger.info("[API] Registered /api/public/live, /api/public/most-played, /api/public/live/stream")
