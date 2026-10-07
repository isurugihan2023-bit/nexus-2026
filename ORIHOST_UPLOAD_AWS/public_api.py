"""
backend/public_api.py - Public read-only API for the NEXUS website LIVE page.

Routes (additive, existing endpoints untouched):
  GET /api/public/live                  -> live games grouped by game
  GET /api/public/most-played?range=7d  -> per-GAME ranking, last N days (top 9)
  GET /api/public/live/stream           -> SSE stream of the live payload
  GET /api/public/spotify               -> Spotify "Now Listening" listeners
  GET /api/public/spotify/stream        -> SSE stream of the Spotify payload

Performance contract (see task spec):
  * Responses are served from an in-memory snapshot refreshed in the
    background (live every 3-5s, most-played every 60s). NOTHING is computed
    inside a request handler - requests only serialize pre-built bytes.
  * SQLite reads and FiveM lookups run in an executor (asyncio.to_thread)
    with 2s timeouts. A slow/failed dependency keeps the previous snapshot;
    requests never 504 because of it.
  * FiveM player counts are cached 15-30s; a failed lookup keeps the
    previous good value instead of blanking the card.

Safety: per-IP rate limit, ETag/304, strict CORS allow-list
(env NEXUS_WEBSITE_ORIGINS, no wildcard), input validation, no Discord IDs /
tokens in responses, member resolution cached (fetch_member at most once per
member per TTL, 2s budget each).

Images: the API returns game_key + category + RELATIVE images/games/* paths
only. The website resolves artwork itself; absolute http://IP:port URLs are
never emitted.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Set

from aiohttp import web

logger = logging.getLogger("nexus.public_api")

DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png?size=64"

# Refresh cadence (env-overridable, clamped to the contracted ranges).
LIVE_INTERVAL_DEFAULT = 4.0
LIVE_INTERVAL_MIN = 3.0
LIVE_INTERVAL_MAX = 5.0
MP_INTERVAL_DEFAULT = 60.0
DB_TIMEOUT_SECONDS = 2.0
MEMBER_TTL_SECONDS = 600.0
MEMBER_MISS_TTL_SECONDS = 60.0
MEMBER_FETCH_TIMEOUT = 2.0
MEMBER_FETCH_CONCURRENCY = 5

MP_LABELS_PREWARM = ("7d", "30d", "24h")
RANGE_LABELS = {"week": "7d", "month": "30d", "all": "30d",
                "day": "24h", "1d": "24h"}
VALID_RANGES = ("7d", "week", "30d", "month", "all", "24h", "day", "1d")


def _live_interval() -> float:
    try:
        v = float(os.getenv("NEXUS_LIVE_REFRESH_SECONDS", "") or LIVE_INTERVAL_DEFAULT)
    except Exception:
        v = LIVE_INTERVAL_DEFAULT
    return max(LIVE_INTERVAL_MIN, min(LIVE_INTERVAL_MAX, v))


def _mp_interval() -> float:
    try:
        v = float(os.getenv("NEXUS_MP_REFRESH_SECONDS", "") or MP_INTERVAL_DEFAULT)
    except Exception:
        v = MP_INTERVAL_DEFAULT
    return max(30.0, v)


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
    u = (url or "").strip() or DEFAULT_AVATAR
    if "cdn.discordapp.com" in u:
        base = u.split("?")[0]
        return f"{base}?size=64"
    return u


def _game_meta(game_key: str) -> Dict[str, str]:
    """Category from games.json; image as a RELATIVE website path.

    The website resolves artwork itself, so only game_key, category and a
    relative images/games/* path (or key) leave this API - never an absolute
    http://IP:port URL. Unknown apps get category "Other" with the generic
    cover - never a real game's category.
    """
    category = "Other"
    try:
        from game_tracker import load_tracker_config
        cfg = load_tracker_config()
        meta = (cfg.get("metadata") or {}).get((game_key or "").lower(), {})
        category = str(meta.get("category") or "Other")
    except Exception:
        pass
    try:
        from artwork import relative_image_for, category_image
        image = relative_image_for(game_key, category)
        return {"category": category, "image": image,
                "fallback": category_image(category)
                if category_image(category).startswith("images/")
                else "images/games/fallback.svg"}
    except Exception:
        return {"category": category, "image": "images/games/fallback.svg",
                "fallback": "images/games/fallback.svg"}


def _maybe_prefetch_artwork(game_key: str, game_name: str, image: str) -> None:
    """Fire-and-forget RAWG cover download (no-op without RAWG_API_KEY)."""
    try:
        from artwork import should_prefetch, ensure_cached
        if not should_prefetch(game_key, image):
            return
        loop = asyncio.get_running_loop()
        loop.create_task(ensure_cached(game_key, game_name))
    except Exception:
        pass


def _parse_range(value: str) -> int:
    v = (value or "7d").strip().lower()
    mapping = {"7d": 7, "week": 7, "30d": 30, "month": 30,
               "all": 30, "24h": 1, "day": 1, "1d": 1}
    days = mapping.get(v, 7)
    return days * 86400 * 1000


def _empty_live_payload() -> Dict[str, Any]:
    return {"generated_at": int(time.time() * 1000), "games": [],
            "total_playing": 0}


class PublicApiRouter:
    def __init__(self, db, fivem_address: str = "", images_dir: str = ""):
        self.db = db
        self.fivem_address = fivem_address or os.getenv("FIVEM_SERVER_ADDRESS", "")
        try:
            from asset_capture import resolve_dir as _resolve_dir
            self.images_dir = images_dir or _resolve_dir()
        except Exception:
            self.images_dir = images_dir or os.path.join("images", "games", "auto")
        try:
            from game_tracker import load_tracker_config
            self._tracker_cfg = load_tracker_config()
        except Exception:
            self._tracker_cfg = {"aliases": {}, "ignore_apps": []}
        self._guilds_provider = None
        # Member cache: user_id -> {"name","avatar","at","miss"}. fetch_member
        # runs at most once per member per TTL (misses cached briefly too).
        self._member_cache: Dict[str, Dict[str, Any]] = {}
        self._fetch_sem = asyncio.Semaphore(MEMBER_FETCH_CONCURRENCY)
        # Snapshot stores: {"body": bytes, "etag": str, "at": float,
        #                   "version": int}. Served verbatim by requests.
        self._live_snap: Dict[str, Any] = {"body": b"", "etag": "", "at": 0.0,
                                           "version": 0}
        self._mp_snaps: Dict[str, Dict[str, Any]] = {}
        self._mp_requested = set(MP_LABELS_PREWARM)
        self._live_event = asyncio.Event()   # set by invalidate_live()
        self._snap_changed = asyncio.Event()  # set by every rebuild (SSE)
        self._spotify_changed = asyncio.Event()  # set by Spotify rebuilds (SSE)
        # Spotify snapshot: rebuilt on demand, throttled to 2s max cache.
        self._spotify_snap: Dict[str, Any] = {"body": b"", "etag": "",
                                              "at": 0.0, "version": 0}
        self._spotify_built_at = 0.0  # monotonic, 2s throttle
        self._bg_tasks: List[asyncio.Task] = []
        self._bg_started = False
        self._hits: Dict[str, List[float]] = {}
        self._limit = int(os.getenv("NEXUS_PUBLIC_RATELIMIT", "120"))
        self._window = 60.0

    # ── background refresh ──
    def start_background(self, app: Optional[web.Application] = None) -> None:
        """Start the refresh loops. Idempotent.

        Pass the aiohttp app on the bot host so tasks are bound to startup /
        cleanup; without an app, tasks spawn on the running loop (tests,
        standalone harness).
        """
        if self._bg_started:
            return
        self._bg_started = True
        if app is not None:
            app.on_startup.append(self._on_startup)
            app.on_cleanup.append(self._on_cleanup)
        else:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                self._bg_started = False
                return
            self._bg_tasks = [loop.create_task(self._live_loop()),
                              loop.create_task(self._mp_loop())]

    async def _on_startup(self, app: web.Application) -> None:
        # Prewarm synchronously so the first request is already warm (<1s).
        try:
            await asyncio.wait_for(self._rebuild_live(), timeout=5.0)
        except Exception as e:
            logger.warning("[API] live prewarm failed: %s", e)
        try:
            await asyncio.wait_for(self._rebuild_most_played_all(), timeout=8.0)
        except Exception as e:
            logger.warning("[API] most-played prewarm failed: %s", e)
        self._bg_tasks = [asyncio.create_task(self._live_loop()),
                          asyncio.create_task(self._mp_loop())]

    async def _on_cleanup(self, app: web.Application) -> None:
        for t in self._bg_tasks:
            t.cancel()
        self._bg_tasks = []
        self._bg_started = False

    def invalidate_live(self):
        """Presence/heartbeat changed something: rebuild ASAP.

        Never clears the snapshot - requests keep serving the previous value
        until the rebuild lands, so invalidation can never cause a stall.
        """
        try:
            self._live_event.set()
        except Exception:
            pass

    async def _live_loop(self) -> None:
        interval = _live_interval()
        while True:
            try:
                await self._rebuild_live()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("[API] live rebuild failed (keeping previous): %s", e)
            try:
                await asyncio.wait_for(self._live_event.wait(), timeout=interval)
            except asyncio.TimeoutError:
                pass
            except asyncio.CancelledError:
                raise
            finally:
                try:
                    self._live_event.clear()
                except Exception:
                    pass

    async def _mp_loop(self) -> None:
        interval = _mp_interval()
        while True:
            try:
                await self._rebuild_most_played_all()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning("[API] most-played rebuild failed (keeping previous): %s", e)
            try:
                await asyncio.sleep(interval)
            except asyncio.CancelledError:
                raise

    def _store_snap(self, store: Dict[str, Any], payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        store["body"] = raw
        store["etag"] = self._etag(raw)
        store["at"] = time.monotonic()
        store["version"] = int(store.get("version", 0)) + 1
        self._snap_changed.set()
        try:
            self._spotify_changed.set()
        except Exception:
            pass

    # ── member resolution (background only, never in requests) ──
    def _member_info(self, member: Any) -> Optional[Dict[str, str]]:
        if member is None:
            return None
        try:
            name = (str(getattr(member, "display_name", "") or "").strip()
                    or str(getattr(member, "name", "") or "").strip()
                    or "Member")
            avatar_obj = getattr(member, "display_avatar", None)
            avatar = str(getattr(avatar_obj, "url", "") or "").strip()
            if not avatar:
                avatar = str(getattr(getattr(member, "avatar", None), "url", "") or "").strip()
            return {"name": name, "avatar": avatar or DEFAULT_AVATAR}
        except Exception:
            return None

    async def _fetch_member_once(self, guilds: List[Any], user_id: str) -> Any:
        """One guild.fetch_member per member (2s budget). Returns None on miss."""
        async with self._fetch_sem:
            for guild in guilds or []:
                fetch = getattr(guild, "fetch_member", None)
                if fetch is None:
                    continue
                try:
                    uid = int(user_id)
                except Exception:
                    return None
                try:
                    member = await asyncio.wait_for(fetch(uid), timeout=MEMBER_FETCH_TIMEOUT)
                    if member is not None:
                        return member
                except Exception:
                    continue
        return None

    async def _resolve_members(self, rows: List[Dict[str, Any]]) -> None:
        """Enrich DB rows in place with cached/fresh member display data.

        Best-effort: anything unresolvable keeps its DB username/avatar (or
        the Member/default-avatar fallback). No player is ever dropped here.
        """
        if not rows or self._guilds_provider is None:
            return
        try:
            guilds = self._guilds_provider() or []
        except Exception:
            return
        if not guilds:
            return
        now = time.monotonic()
        cached_by_id: Dict[str, Any] = {}
        for guild in guilds:
            try:
                members = getattr(guild, "members", None) or []
            except Exception:
                continue
            for m in members:
                try:
                    uid = str(getattr(m, "id", ""))
                except Exception:
                    continue
                if uid and uid not in cached_by_id:
                    cached_by_id[uid] = m

        async def _one(row: Dict[str, Any]) -> None:
            uid = str(row.get("user_id") or "")
            if not uid:
                return
            hit = self._member_cache.get(uid)
            if hit and not hit.get("miss") and now - float(hit.get("at", 0)) < MEMBER_TTL_SECONDS:
                row["_member"] = hit
                return
            if hit and hit.get("miss") and now - float(hit.get("at", 0)) < MEMBER_MISS_TTL_SECONDS:
                return  # negative-cached: do not re-fetch yet
            member = cached_by_id.get(uid)
            if member is None:
                member = await self._fetch_member_once(guilds, uid)
            info = self._member_info(member)
            if info:
                entry = {"name": info["name"], "avatar": info["avatar"],
                         "at": now, "miss": False}
                self._member_cache[uid] = entry
                row["_member"] = entry
            else:
                self._member_cache[uid] = {"at": now, "miss": True}

        await asyncio.gather(*(_one(r) for r in rows))

    # ── snapshot builders (background only, except cold-start fallback) ──
    async def _snapshot_live(self) -> Dict[str, Any]:
        """Full live payload. DB + FiveM in executor with 2s timeouts."""
        rows = await asyncio.wait_for(
            asyncio.to_thread(self.db.get_open_game_sessions), timeout=DB_TIMEOUT_SECONDS)
        try:
            optouts = set(await asyncio.wait_for(
                asyncio.to_thread(self.db.get_privacy_optouts), timeout=DB_TIMEOUT_SECONDS))
        except Exception:
            optouts = set()
        try:
            from fivem import fetch_player_count_sync
            server_players_raw = await asyncio.wait_for(
                asyncio.to_thread(fetch_player_count_sync, self.fivem_address),
                timeout=DB_TIMEOUT_SECONDS)
        except Exception:
            server_players_raw = None
        await self._resolve_members(rows)
        grouped: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            if str(r.get("user_id")) in optouts:
                continue
            key = str(r.get("game_key") or "unknown")
            name = str(r.get("game_name") or key)
            member = r.get("_member") or {}
            username = (str(member.get("name") or "").strip()
                        or str(r.get("username") or "").strip()
                        or "Member")
            avatar = _avatar64(str(member.get("avatar") or r.get("avatar_url") or ""))
            g = grouped.setdefault(key, {"game_key": key, "name": name, "players": []})
            # Never drop a player because one field is missing: every field
            # above has a fallback, and rows are appended unconditionally.
            g["players"].append({
                "name": username,
                "avatar": avatar,
                "details": str(r.get("details") or "")[:140],
                "state": str(r.get("state") or "")[:140],
                "since": int(r.get("started_at") or 0),
            })
        server_players = None
        if server_players_raw:
            try:
                server_players = {"current": int(server_players_raw["current"]),
                                  "max": int(server_players_raw.get("max") or 100)}
            except Exception:
                server_players = None
        games = []
        for key in sorted(grouped, key=lambda k: len(grouped[k]["players"]), reverse=True):
            g = grouped[key]
            g["players"].sort(key=lambda p: p["name"].lower())
            meta = _game_meta(key)
            _maybe_prefetch_artwork(key, g["name"], meta["image"])
            games.append({
                "game_key": key, "name": g["name"],
                "category": meta["category"], "image": meta["image"],
                "fallback": meta["fallback"],
                "server_players": server_players if key == "ceylon-roleplay" else None,
                "players": g["players"], "player_count": len(g["players"]),
            })
        return {"generated_at": int(time.time() * 1000), "games": games,
                "total_playing": sum(g["player_count"] for g in games)}

    async def _build_live(self) -> Dict[str, Any]:
        """Payload builder (kept public for tests/standalone use)."""
        return await self._snapshot_live()

    async def _snapshot_most_played(self, range_ms: int, range_label: str) -> Dict[str, Any]:
        rows = await asyncio.wait_for(
            asyncio.to_thread(self.db.get_game_most_played, range_ms, 9),
            timeout=DB_TIMEOUT_SECONDS)
        games = []
        for r in rows:
            game_key = str(r.get("game_key") or "")
            name = str(r.get("name") or "")
            if not (game_key or name):
                continue
            meta = _game_meta(game_key)
            top = [{"name": str(p.get("name") or "Member"),
                    "avatar": _avatar64(str(p.get("avatar") or ""))}
                   for p in (r.get("top_players") or [])[:4]]
            _maybe_prefetch_artwork(game_key, name, meta["image"])
            games.append({
                "rank": int(r.get("rank") or 0),
                "game_key": game_key,
                "name": name,
                "category": meta["category"], "image": meta["image"],
                "fallback": meta["fallback"],
                "unique_players": int(r.get("unique_players") or 0),
                "total_hours": float(r.get("total_hours") or 0),
                "sessions": int(r.get("sessions") or 0),
                "top_players": top,
            })
        return {"generated_at": int(time.time() * 1000),
                "range": range_label, "games": games[:9]}

    async def _build_most_played(self, range_ms: int, range_label: str) -> Dict[str, Any]:
        """Payload builder (kept public for tests/standalone use)."""
        return await self._snapshot_most_played(range_ms, range_label)

    # ── Spotify "Now Listening" (in-memory, max 2s cache) ──────────
    def _empty_spotify_payload(self) -> Dict[str, Any]:
        return {"generated_at": int(time.time() * 1000),
                "listeners": [], "total": 0}

    async def _spotify_optouts(self) -> Set[str]:
        hidden: Set[str] = set()
        try:
            priv = await asyncio.wait_for(
                asyncio.to_thread(self.db.get_privacy_optouts),
                timeout=DB_TIMEOUT_SECONDS)
            hidden.update(str(u) for u in (priv or []))
        except Exception:
            pass
        try:
            get_sp = getattr(self.db, "get_spotify_optouts", None)
            if callable(get_sp):
                sp = await asyncio.wait_for(
                    asyncio.to_thread(get_sp), timeout=DB_TIMEOUT_SECONDS)
                hidden.update(str(u) for u in (sp or []))
        except Exception:
            pass
        return hidden

    async def _snapshot_spotify(self) -> Dict[str, Any]:
        """Full Spotify payload. In-memory + opt-out DB reads only."""
        try:
            import spotify_tracker as _sp
        except Exception:
            return self._empty_spotify_payload()
        if not _sp.show_spotify_enabled():
            return self._empty_spotify_payload()
        hidden = await self._spotify_optouts()
        now_ms = int(time.time() * 1000)
        try:
            listeners = await asyncio.wait_for(
                asyncio.to_thread(_sp.get_spotify_live, now_ms, hidden, True),
                timeout=DB_TIMEOUT_SECONDS)
        except Exception:
            listeners = []
        clean = []
        for r in listeners or []:
            clean.append({
                "name": str(r.get("name") or "Member")[:32],
                "avatar": _avatar64(str(r.get("avatar") or "")),
                "title": str(r.get("title") or "")[:140],
                "artist": str(r.get("artist") or "")[:200],
                "album": str(r.get("album") or "")[:140],
                "art": str(r.get("art") or "")[:500],
                "track_url": str(r.get("track_url") or "")[:300],
                "start": r.get("start"),
                "end": r.get("end"),
            })
        clean.sort(key=lambda x: (x["artist"].lower(), x["title"].lower(),
                                  x["name"].lower()))
        return {"generated_at": now_ms, "listeners": clean,
                "total": len(clean)}

    async def _build_spotify(self) -> Dict[str, Any]:
        """Payload builder (kept public for tests/standalone use)."""
        return await self._snapshot_spotify()

    async def _rebuild_spotify(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and self._spotify_snap.get("body") and \
                (now - self._spotify_built_at) < 2.0:
            return
        payload = await asyncio.wait_for(self._snapshot_spotify(), timeout=10.0)
        self._store_snap(self._spotify_snap, payload)
        self._spotify_built_at = time.monotonic()

    def invalidate_spotify(self) -> None:
        """Song changed / stopped: next read rebuilds + SSE wakes up."""
        self._spotify_built_at = 0.0
        try:
            self._spotify_changed.set()
        except Exception:
            pass
        try:
            self._snap_changed.set()
        except Exception:
            pass

    async def _rebuild_live(self) -> None:
        payload = await asyncio.wait_for(self._snapshot_live(), timeout=10.0)
        self._store_snap(self._live_snap, payload)

    async def _rebuild_most_played_all(self) -> None:
        for label in sorted(set(self._mp_requested) | set(MP_LABELS_PREWARM)):
            range_ms = _parse_range(label)
            payload = await asyncio.wait_for(
                self._snapshot_most_played(range_ms, label), timeout=10.0)
            snap = self._mp_snaps.setdefault(
                label, {"body": b"", "etag": "", "at": 0.0, "version": 0})
            self._store_snap(snap, payload)

    # ── request helpers (no compute; snapshots only) ──
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

    def _serve_snap(self, request: web.Request, snap: Dict[str, Any],
                    cache_control: str) -> web.Response:
        body = snap.get("body") or b"{}"
        etag = snap.get("etag") or self._etag(body)
        if request.headers.get("If-None-Match") == etag:
            resp = web.Response(status=304)
        else:
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

    # ── routes ──
    async def get_live(self, request: web.Request) -> web.Response:
        if request.method == "OPTIONS":
            return await self._options(request)
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        if not self._live_snap.get("body"):
            # Background loop not running (standalone wiring): build once
            # within a tight budget rather than serving nothing.
            try:
                payload = await asyncio.wait_for(self._snapshot_live(), timeout=2.5)
                self._store_snap(self._live_snap, payload)
            except Exception as e:
                logger.warning("[API] cold live build failed: %s", e)
                return web.json_response(_empty_live_payload())
        return self._serve_snap(request, self._live_snap, "public, max-age=5")

    async def get_most_played(self, request: web.Request) -> web.Response:
        if request.method == "OPTIONS":
            return await self._options(request)
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        raw_range = (request.query.get("range")
                     or request.query.get("period") or "7d")
        if raw_range not in VALID_RANGES:
            return web.json_response({"error": "bad range (7d|30d|all)"}, status=400)
        label = RANGE_LABELS.get(raw_range, raw_range)
        self._mp_requested.add(label)
        snap = self._mp_snaps.get(label)
        if not snap or not snap.get("body"):
            try:
                payload = await asyncio.wait_for(
                    self._snapshot_most_played(_parse_range(raw_range), label),
                    timeout=2.5)
                snap = self._mp_snaps.setdefault(
                    label, {"body": b"", "etag": "", "at": 0.0, "version": 0})
                self._store_snap(snap, payload)
            except Exception as e:
                logger.warning("[API] cold most-played build failed: %s", e)
                return web.json_response({"generated_at": int(time.time() * 1000),
                                           "range": label, "games": []})
        return self._serve_snap(request, snap, "public, max-age=60")

    async def get_spotify(self, request: web.Request) -> web.Response:
        """GET /api/public/spotify - cached max 2s, no user IDs exposed."""
        if request.method == "OPTIONS":
            return await self._options(request)
        if self._rate_limited(request):
            return web.json_response({"error": "rate_limited"}, status=429)
        try:
            await asyncio.wait_for(self._rebuild_spotify(), timeout=2.5)
        except Exception as e:
            logger.warning("[API] spotify build failed: %s", e)
            if not self._spotify_snap.get("body"):
                return web.json_response(self._empty_spotify_payload())
        return self._serve_snap(request, self._spotify_snap, "public, max-age=2")

    async def spotify_stream(self, request: web.Request) -> web.Response:
        """GET /api/public/spotify/stream - SSE, pushes on every change."""
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

        async def send_snapshot() -> bool:
            try:
                body = self._spotify_snap.get("body") or b"{}"
                await resp.write(b"event: spotify\n")
                await resp.write(b"data: " + body + b"\n\n")
                return True
            except Exception:
                return False

        try:
            try:
                await asyncio.wait_for(self._rebuild_spotify(force=True), timeout=2.5)
            except Exception:
                if not self._spotify_snap.get("body"):
                    self._store_snap(self._spotify_snap,
                                     self._empty_spotify_payload())
                    self._spotify_built_at = time.monotonic()
            if not await send_snapshot():
                return resp
            last_version = int(self._spotify_snap.get("version", 0))
            for _ in range(200):  # ~50 min max per connection
                try:
                    self._spotify_changed.clear()
                    await asyncio.wait_for(self._spotify_changed.wait(),
                                           timeout=15.0)
                except asyncio.TimeoutError:
                    pass
                except asyncio.CancelledError:
                    break
                try:
                    await asyncio.wait_for(self._rebuild_spotify(), timeout=2.5)
                except Exception:
                    pass
                try:
                    await resp.write(b": heartbeat\n\n")
                except Exception:
                    break
                if int(self._spotify_snap.get("version", 0)) != last_version:
                    last_version = int(self._spotify_snap.get("version", 0))
                    if not await send_snapshot():
                        break
        except (asyncio.CancelledError, ConnectionResetError):
            pass
        finally:
            try:
                await resp.write_eof()
            except Exception:
                pass
        return resp

    async def get_auto_asset(self, request: web.Request) -> web.Response:
        """Serve one captured auto/ cover's bytes (sync bridge only).

        Operator tooling (scripts/pull_auto_covers.py) pulls these bytes
        into git so Vercel serves them. Browsers never fetch this - the
        website only uses same-origin images/games/auto/*.jpg, so no
        absolute bot URL is ever emitted to a page.
        """
        import re
        name = (request.match_info.get("name") or "").strip().lower()
        if not re.fullmatch(r"[a-z0-9-]+\.jpg", name):
            return web.json_response({"error": "bad name"}, status=400)
        path = os.path.join(self.images_dir, name)
        if not os.path.isfile(path):
            return web.json_response({"error": "not captured yet"}, status=404)
        try:
            with open(path, "rb") as f:
                body = f.read()
        except Exception:
            return web.json_response({"error": "unreadable"}, status=404)
        resp = web.Response(body=body, content_type="image/jpeg")
        resp.headers["Cache-Control"] = "public, max-age=86400"
        for k, v in _cors_headers(request).items():
            if v:
                resp.headers[k] = v
        return resp

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

        async def send_snapshot() -> bool:
            try:
                await resp.write(b"data: " + self._live_snap["body"] + b"\n\n")
                return True
            except Exception:
                return False

        try:
            # Full current snapshot IMMEDIATELY on connect - never wait for
            # the next change. Build once if the background loop has not run.
            if not self._live_snap.get("body"):
                try:
                    payload = await asyncio.wait_for(self._snapshot_live(), timeout=2.5)
                    self._store_snap(self._live_snap, payload)
                except Exception:
                    self._store_snap(self._live_snap, _empty_live_payload())
            if not await send_snapshot():
                return resp
            last_version = int(self._live_snap.get("version", 0))
            for _ in range(200):  # ~50 min max per connection
                try:
                    self._snap_changed.clear()
                    await asyncio.wait_for(self._snap_changed.wait(), timeout=15.0)
                except asyncio.TimeoutError:
                    pass
                except asyncio.CancelledError:
                    break
                # Heartbeat every 15s keeps additions/proxies from idling out.
                try:
                    await resp.write(b": heartbeat\n\n")
                except Exception:
                    break
                if int(self._live_snap.get("version", 0)) != last_version:
                    last_version = int(self._live_snap.get("version", 0))
                    if not await send_snapshot():
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
        self._guilds_provider = bot_guilds_provider
        app.router.add_route("OPTIONS", "/api/public/live", self._options)
        app.router.add_get("/api/public/live", self.get_live)
        app.router.add_route("OPTIONS", "/api/public/most-played", self._options)
        app.router.add_get("/api/public/most-played", self.get_most_played)
        app.router.add_get("/api/public/live/stream", self.live_stream)
        app.router.add_route("OPTIONS", "/api/public/spotify", self._options)
        app.router.add_get("/api/public/spotify", self.get_spotify)
        app.router.add_get("/api/public/spotify/stream", self.spotify_stream)
        app.router.add_get("/api/public/assets/{name}", self.get_auto_asset)
        logger.info("[API] Registered /api/public/live, /api/public/most-played, /api/public/live/stream, /api/public/spotify, /api/public/spotify/stream, /api/public/assets/{name}")
