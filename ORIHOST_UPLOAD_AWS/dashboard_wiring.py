"""
dashboard_wiring.py - EXACT patch guide for the FLAT VPS bot (/home/container).

FLAT layout: every module sits next to bot.py / dashboard.py - NO "backend."
imports anywhere, spotify_tracker.py in root, games.json in root.

Goal: GET /api/public/live, /api/public/most-played and /api/public/live/stream
answer WITHOUT auth (today they 401), while every other route stays protected.
Spotify "Now Listening" (GET /api/public/spotify + /api/public/spotify/stream)
is included: same whitelist, same in-memory instant updates, never touches
game sessions / Most Played / history.

Word-boundary alias fix + "Code" ignore (VS Code no longer becomes Call of
Duty / TACTICAL FPS; "Code Vein" still maps to itself) and unknown-app
category "Other" are included via game_tracker.py + games.json.

Apply the numbered hunks below to /home/container/dashboard.py (or wherever
your bot creates its aiohttp web.Application and its TWO auth middlewares)
and to bot.py (presence + commands). Nothing here changes existing behavior:
all additions are additive - your earlier fixes (get_combined_live,
scan-miss guard, no-fetch_member reconcile, boot race fix, !live_debug,
!cleanup_live, ignore_apps, live_cleanup_on_boot) are untouched, and the
only modified lines are the two one-line whitelist bypasses.

Hunk 1 - imports (top of dashboard.py / bot.py, flat - no package prefix):
    from db import GamingDatabase
    import game_tracker
    import asset_capture
    import spotify_tracker
    from public_api import PublicApiRouter
    from dashboard_wiring import (
        rebuild_game_sessions,
        rebuild_spotify_sessions,
        handle_spotify_presence,
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
    _tracker_cfg = game_tracker.load_tracker_config()  # ./games.json (flat root)
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
        # Captured artwork: remember the Rich Presence image URL on every
        # START/SWITCH/HEARTBEAT and download it once (URL-change dedup).
        # Opted-out members never create or update assets.
        try:
            member = after if after is not None else before
            act = game_tracker.extract_playing_activity(member, _tracker_cfg)
            assets = (act or {}).get("assets") or {}
            url = assets.get("large") or assets.get("small")
            uid = str(getattr(member, "id", ""))
            if act and url and uid not in set(db.get_privacy_optouts()):
                changed = db.save_game_asset(
                    act["game_key"], url, assets.get("app_id", ""))
                if changed or not asset_capture.cover_exists("", act["game_key"]):
                    bot.loop.create_task(asset_capture.ensure_game_cover(
                        "", act["game_key"], url, assets.get("app_id", ""),
                        force=changed))
        except Exception as _e:
            # TEMPORARY (survey only): print instead of pass so the real
            # error shows in the panel console. Revert to pass afterwards.
            print(f"[ASSETS] capture block error: {type(_e).__name__}: {_e}")

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

      If your middlewares instead match explicit route lists, add these five
      paths to the public/allow list (GET only is fine):
          /api/public/live
          /api/public/most-played
          /api/public/live/stream
          /api/public/spotify
          /api/public/spotify/stream

Hunk 7 - boot rebuild (inside on_ready, after your existing reconcile):
    report = rebuild_game_sessions(list(bot.guilds), db, _tracker_cfg)
    rebuild_spotify_sessions(list(bot.guilds))
    bot.loop.create_task(game_heartbeat_loop(bot, db, _tracker_cfg, public_router))
    bot.loop.create_task(game_prune_loop(bot, db))

Hunk 8 - privacy command (wherever a user opts out / back in; the 5s live
cache otherwise delays the effect by a few seconds):
    db.set_privacy_optout(str(member.id), opted_out)
    public_router.invalidate_live()

Hunk 8b - Spotify presence (ADD to the on_presence_update from Hunk 5, right
after the game_tracker.handle_presence_update block - updates instantly,
no waiting for the 60s loop; Spotify never touches game sessions):
    spotify_action = handle_spotify_presence(before, after, public_router)

Hunk 8c - !spotify off/on (per-user; independent of global privacy opt-out):
    # inside on_message (or your command handler), before other commands:
    if content.strip().lower() in ("!spotify off", "!spotify on"):
        opted_out = content.strip().lower().endswith("off")
        db.set_spotify_optout(str(message.author.id), opted_out)
        try:
            public_router.invalidate_spotify()
        except Exception:
            pass
        await message.channel.send(
            "Spotify sharing turned OFF. Use !spotify on to re-enable."
            if opted_out else "Spotify sharing turned ON.")
        return
    # Env flag (default true): NEXUS_SHOW_SPOTIFY=false blanks /api/public/spotify.

Hunk 9 - tuning knobs (env vars, all optional; no .env file needed):
    NEXUS_LIVE_REFRESH_SECONDS=4   # live snapshot cadence, clamped to 3-5s
    NEXUS_MP_REFRESH_SECONDS=60    # most-played cadence, minimum 30s
    NEXUS_FIVEM_CACHE_SECONDS=15   # FiveM count cache, clamped to 15-30s
    FIVEM_SERVER_ADDRESS=""        # host:port or info URL (or games.json
                                     # fivem_server.address); empty = no lookup
    NEXUS_PUBLIC_RATELIMIT=120     # per-IP requests per minute
    NEXUS_AUTO_ART_DIR=""          # captured auto/ covers dir (VPS layout);
                                     # empty = images/games/auto under CWD.
                                     # pip install Pillow for the capture.

Hunk 10 - asset survey + sync (Rich Presence covers):
    a. Restart the bot, have members play (FiveM/Ceylon first), then:
           journalctl / bot logs | grep ASSETS-TEMP
       Paste the lines back - that is the survey of which games ship
        large_image artwork. Remove _log_activity_assets + its call in
        game_tracker.py afterwards (marked TEMPORARY).
    b. Captured files land in $NEXUS_AUTO_ART_DIR (or images/games/auto).
       Pull them into this repo and deploy:
           python scripts/pull_auto_covers.py http://157.90.181.183:23063
           git add images/games/auto && git commit -m "Captured art" && git push
       The website then serves them as images/games/auto/<key>.jpg with
       zero code changes (chain: manual -> auto -> category -> fallback).

That is the whole patch. No other dashboard.py line needs to change.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("nexus.wiring")


def rebuild_game_sessions(guilds: List[Any], db: Any, cfg: Any,
                          now_ms: int = None) -> Dict[str, int]:
    """Boot-time rebuild (call from on_ready). Shared by bot and test harness.

    Closes orphaned rows at last_seen, rebuilds the live set from
    guild.members, closes any still-open rows for ignored apps (e.g. VS Code
    "Code" sessions stranded by older builds), prunes history older than
    30 days. Returns counts.
    """
    import game_tracker

    now = now_ms if now_ms is not None else int(time.time() * 1000)
    orphaned = db.close_orphaned_game_sessions(now_ms=now)
    live = game_tracker.scan_live_members(guilds, cfg)
    try:
        optouts = set(db.get_privacy_optouts())
    except Exception:
        optouts = set()
    captured = 0
    for uid, act in live.items():
        db.open_game_session(
            guild_id=act.get("guild_id", ""), user_id=uid,
            username=act["username"], avatar_url=act["avatar"],
            game_key=act["game_key"], game_name=act["game_name"],
            details=act.get("details", ""), state=act.get("state", ""),
            started_at=act.get("start_timestamp") or now, now_ms=now)
        # Remember captured artwork URLs (no download here: this is sync;
        # the heartbeat loop / on_presence downloads). Opted-out members
        # never create or update assets.
        try:
            assets = act.get("assets") or {}
            url = assets.get("large") or assets.get("small")
            if url and uid not in optouts and hasattr(db, "save_game_asset"):
                if db.save_game_asset(act["game_key"], url, assets.get("app_id", "")):
                    captured += 1
        except Exception:
            pass
    pruned = db.prune_old_game_sessions(now_ms=now)
    # Stranded ignored-app rows (e.g. "Code" opened by a build before the
    # ignore entry): the orphan close above already ended them, but close by
    # name/key explicitly so no path can leave one open across a restart.
    ignored_closed = 0
    try:
        ignore_names = [str(x).lower().strip()
                        for x in ((cfg or {}).get("ignore_apps") or []) if str(x).strip()]
        if ignore_names and hasattr(db, "close_open_game_sessions_for_names"):
            ignored_closed = db.close_open_game_sessions_for_names(ignore_names, now_ms=now)
    except Exception:
        pass
    logger.info("[GAMES] Boot rebuild: orphans=%d live=%d pruned=%d assets=%d ignored_closed=%d",
                orphaned, len(live), pruned, captured, ignored_closed)
    return {"orphaned": orphaned, "live": len(live), "pruned": pruned,
            "ignored_closed": ignored_closed}


async def game_heartbeat_loop(bot: Any, db: Any, cfg: Any,
                              public_router: Any = None,
                              interval: float = 60.0) -> None:
    """60s heartbeat: refresh last_seen for everyone still playing."""
    import game_tracker

    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            now_ms = int(time.time() * 1000)
            live = game_tracker.scan_live_members(list(bot.guilds), cfg)
            try:
                optouts = set(db.get_privacy_optouts())
            except Exception:
                optouts = set()
            for uid, act in live.items():
                try:
                    db.heartbeat_game_session(uid, act["game_key"], now_ms=now_ms,
                                              details=act.get("details", ""),
                                              state=act.get("state", ""))
                except Exception:
                    pass
                # Captured artwork: remember URL changes, download once.
                # Opted-out members are skipped entirely here.
                try:
                    import asset_capture
                    assets = act.get("assets") or {}
                    url = assets.get("large") or assets.get("small")
                    if url and uid not in optouts and hasattr(db, "save_game_asset"):
                        changed = db.save_game_asset(
                            act["game_key"], url, assets.get("app_id", ""))
                        if changed or not asset_capture.cover_exists("", act["game_key"]):
                            asyncio.get_running_loop().create_task(
                                asset_capture.ensure_game_cover(
                                    "", act["game_key"], url,
                                    assets.get("app_id", ""), force=changed))
                except Exception:
                    pass
            if public_router is not None:
                try:
                    public_router.invalidate_live()
                except Exception:
                    pass
            # Spotify cache scan: pick up song changes missed between presence
            # events + expire finished tracks (end + 15s). Never touches games.
            try:
                changed = sync_spotify_from_scan(list(bot.guilds), now_ms=now_ms)
                if changed and public_router is not None:
                    try:
                        public_router.invalidate_spotify()
                    except Exception:
                        pass
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


# ── Spotify "Now Listening" wiring (additive; games untouched) ──────

def handle_spotify_presence(before: Any, after: Any,
                            public_router: Any = None,
                            now_ms: int = None) -> str:
    """Presence hook for Spotify. Call on EVERY on_presence_update.

    Updates _SPOTIFY_LIVE immediately on song change (no 60s wait),
    removes on STOP/offline, then invalidates the 2s Spotify snapshot
    + wakes the Spotify SSE stream. Returns START | UPDATE | STOP | IGNORED.
    """
    import spotify_tracker

    action = spotify_tracker.handle_spotify_presence(
        before, after, now_ms=now_ms if now_ms is not None else int(time.time() * 1000))
    if action in ("START", "UPDATE", "STOP") and public_router is not None:
        try:
            inv = getattr(public_router, "invalidate_spotify", None)
            if callable(inv):
                inv()
            else:
                public_router.invalidate_live()
        except Exception:
            pass
    return action


def rebuild_spotify_sessions(guilds: List[Any], now_ms: int = None) -> int:
    """Boot/cache-scan sync for Spotify (call from on_ready + scans)."""
    import spotify_tracker

    return spotify_tracker.rebuild_spotify(
        guilds, now_ms=now_ms if now_ms is not None else int(time.time() * 1000))


def sync_spotify_from_scan(guilds: List[Any], now_ms: int = None) -> bool:
    """Heartbeat helper: merge a member scan into _SPOTIFY_LIVE.

    Returns True when the map changed (caller invalidates SSE).
   TTL (end + 15s) is pruned here too. Never touches game sessions.
    """
    import spotify_tracker

    now = now_ms if now_ms is not None else int(time.time() * 1000)
    before_keys = set(spotify_tracker._SPOTIFY_LIVE.keys())
    before_tracks = {u: (e.get("track_id"), e.get("title"))
                     for u, e in spotify_tracker._SPOTIFY_LIVE.items()}
    live = spotify_tracker.scan_spotify_members(guilds, now_ms=now)
    for uid, entry in live.items():
        if len(spotify_tracker._SPOTIFY_LIVE) >= spotify_tracker.MAX_ENTRIES \
                and uid not in spotify_tracker._SPOTIFY_LIVE:
            break
        prev = spotify_tracker._SPOTIFY_LIVE.get(uid)
        if prev != entry:
            spotify_tracker._SPOTIFY_LIVE.pop(uid, None)
            spotify_tracker._SPOTIFY_LIVE[uid] = entry
    # Remove entries whose user is no longer listening (STOP/offline).
    for uid in list(spotify_tracker._SPOTIFY_LIVE.keys()):
        if uid not in live:
            # Keep rows with no end yet for one more cycle only if they were
            # just added by a racing presence event; otherwise drop. The
            # scan is authoritative for offline/STOP, so drop missing users.
            spotify_tracker._SPOTIFY_LIVE.pop(uid, None)
    dropped = spotify_tracker.prune_expired(now_ms=now)
    after_keys = set(spotify_tracker._SPOTIFY_LIVE.keys())
    after_tracks = {u: (e.get("track_id"), e.get("title"))
                    for u, e in spotify_tracker._SPOTIFY_LIVE.items()}
    return before_keys != after_keys or before_tracks != after_tracks or dropped > 0


def parse_spotify_opt_command(content: str) -> Optional[str]:
    """'!spotify off' -> 'off', '!spotify on' -> 'on', else None."""
    text = (content or "").strip().lower()
    if text in ("!spotify off", "!spotify disable", "!spotify hide"):
        return "off"
    if text in ("!spotify on", "!spotify enable", "!spotify show"):
        return "on"
    return None
