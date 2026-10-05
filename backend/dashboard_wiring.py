"""
backend/dashboard_wiring.py - EXACT patch guide for the VPS bot (dashboard.py).

Goal: GET /api/public/live, /api/public/most-played and /api/public/live/stream
answer WITHOUT auth (today they 401), while every other route stays protected.

Apply the 6 numbered hunks below to /home/container/dashboard.py (or wherever
your bot creates its aiohttp web.Application and its TWO auth middlewares).
Nothing here changes existing behavior: all additions are additive, and the
only modified lines are the two one-line whitelist bypasses.

Hunk 1 - imports (top of dashboard.py, next to the other backend imports):
    from backend.db import GamingDatabase
    from backend import game_tracker
    from backend.public_api import PublicApiRouter
    from backend.dashboard_wiring import (
        rebuild_game_sessions,
        game_heartbeat_loop,
        game_prune_loop,
    )

Hunk 2 - intents (where discord.Intents are built). BOTH privileged toggles are
required, in code AND in the Discord Developer Portal
(Bot > Privileged Gateway Intents > Presence Intent + Server Members Intent).
Without them on_presence_update never fires and guild.members is empty.
    intents.presences = True
    intents.members = True

Hunk 3 - init (next to db = ... / app = web.Application(...)):
    _tracker_cfg = game_tracker.load_tracker_config()  # backend/config/games.json
    public_router = PublicApiRouter(db)

Hunk 4 - mount (inside your setup_web_server(app) / where routes attach):
    public_router.attach_routes(app, bot_guilds_provider=lambda: list(bot.guilds))
    public_router.start_background(app)  # refresh loop: live ~4s, most-played 60s

    start_background() hooks app.on_startup (prewarms both snapshots so the
    first request is already warm) and app.on_cleanup (cancels the loops).
    Requests then serve pre-built bytes only - nothing is computed inside a
    request. The guild provider lets the loop resolve display names/avatars
    via the member cache (fetch_member at most once per member per 10 min);
    without it, DB-stored names/avatars are used.

Hunk 5 - presence handler (module level, next to other @bot.event handlers):
    @bot.event
    async def on_presence_update(before, after):
        import time as _t
        now_ms = int(_t.time() * 1000)
        action = game_tracker.handle_presence_update(
            db, before, after, now_ms=now_ms, cfg=_tracker_cfg,
            guild_id=str(getattr(getattr(after, "guild", None), "id", "") or ""))
        try:
            public_router.invalidate_live()
        except Exception:
            pass

Hunk 6 - THE FIX: whitelist GET /api/public/* in BOTH auth middlewares,
exactly the way /static is already excluded. Find each middleware's early
bypass (the line mentioning '/static') and add '/api/public/' to it:

  6a. API auth middleware (the one returning 401 {"error": "Unauthorized"}):
      BEFORE:
          if request.path.startswith("/static/"):
              return await handler(request)
      AFTER:
          if request.path.startswith(("/static/", "/api/public/")):
              return await handler(request)

  6b. Page/dashboard auth middleware (login redirect or 403 for /admin*):
      BEFORE:
          if request.path.startswith(("/static/", "/login")):
              return await handler(request)
      AFTER:
          if request.path.startswith(("/static/", "/login", "/api/public/")):
              return await handler(request)

      If your middlewares instead match explicit route lists, add these three
      paths to the public/allow list (GET only is fine):
          /api/public/live
          /api/public/most-played
          /api/public/live/stream

Hunk 7 - boot rebuild (inside on_ready, after your existing reconcile):
    report = rebuild_game_sessions(list(bot.guilds), db, _tracker_cfg)
    bot.loop.create_task(game_heartbeat_loop(bot, db, _tracker_cfg, public_router))
    bot.loop.create_task(game_prune_loop(bot, db))

Hunk 8 - privacy command (wherever a user opts out / back in; the 5s live
cache otherwise delays the effect by a few seconds):
    db.set_privacy_optout(str(member.id), opted_out)
    public_router.invalidate_live()

Hunk 9 - tuning knobs (env vars, all optional; no .env file needed):
    NEXUS_LIVE_REFRESH_SECONDS=4   # live snapshot cadence, clamped to 3-5s
    NEXUS_MP_REFRESH_SECONDS=60    # most-played cadence, minimum 30s
    NEXUS_FIVEM_CACHE_SECONDS=15   # FiveM count cache, clamped to 15-30s
    FIVEM_SERVER_ADDRESS=""        # host:port or info URL (or games.json
                                     # fivem_server.address); empty = no lookup
    NEXUS_PUBLIC_RATELIMIT=120     # per-IP requests per minute

That is the whole patch. No other dashboard.py line needs to change.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List

logger = logging.getLogger("nexus.wiring")


def rebuild_game_sessions(guilds: List[Any], db: Any, cfg: Any,
                          now_ms: int = None) -> Dict[str, int]:
    """Boot-time rebuild (call from on_ready). Shared by bot and test harness.

    Closes orphaned rows at last_seen, rebuilds the live set from
    guild.members, prunes history older than 30 days. Returns counts.
    """
    from . import game_tracker

    now = now_ms if now_ms is not None else int(time.time() * 1000)
    orphaned = db.close_orphaned_game_sessions(now_ms=now)
    live = game_tracker.scan_live_members(guilds, cfg)
    for uid, act in live.items():
        db.open_game_session(
            guild_id=act.get("guild_id", ""), user_id=uid,
            username=act["username"], avatar_url=act["avatar"],
            game_key=act["game_key"], game_name=act["game_name"],
            details=act.get("details", ""), state=act.get("state", ""),
            started_at=act.get("start_timestamp") or now, now_ms=now)
    pruned = db.prune_old_game_sessions(now_ms=now)
    logger.info("[GAMES] Boot rebuild: orphans=%d live=%d pruned=%d",
                orphaned, len(live), pruned)
    return {"orphaned": orphaned, "live": len(live), "pruned": pruned}


async def game_heartbeat_loop(bot: Any, db: Any, cfg: Any,
                              public_router: Any = None,
                              interval: float = 60.0) -> None:
    """60s heartbeat: refresh last_seen for everyone still playing."""
    from . import game_tracker

    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            now_ms = int(time.time() * 1000)
            live = game_tracker.scan_live_members(list(bot.guilds), cfg)
            for uid, act in live.items():
                try:
                    db.heartbeat_game_session(uid, act["game_key"], now_ms=now_ms,
                                              details=act.get("details", ""),
                                              state=act.get("state", ""))
                except Exception:
                    pass
            if public_router is not None:
                try:
                    public_router.invalidate_live()
                except Exception:
                    pass
        except Exception:
            pass
        try:
            await asyncio.sleep(interval)
        except Exception:
            break


async def game_prune_loop(bot: Any, db: Any) -> None:
    """Daily prune of sessions older than 30 days."""
    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            await asyncio.sleep(24 * 3600)
            try:
                db.prune_old_game_sessions(now_ms=int(time.time() * 1000))
            except Exception:
                pass
        except Exception:
            break
