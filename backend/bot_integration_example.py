"""
backend/bot_integration_example.py - Drop-in Integration Guide for VPS Bot
Demonstrates how to hook live_ws, db, stats_api, and rawg into your existing
discord.py / aiohttp bot daemon.
"""

import asyncio
import os
import discord
from discord.ext import commands
from aiohttp import web

# Import the Ninja Nexus live gaming modules
from .db import GamingDatabase
from .live_ws import LiveGamesWebSocketManager, extract_game_activity
from .stats_api import StatsApiRouter
from .rawg import GameMetadataResolver
from .logger import setup_nexus_logger
from . import game_tracker
from .public_api import PublicApiRouter
from .voice_tracker import (
    reconcile_voice_sessions,
    handle_voice_state_update,
    build_voice_live_payload,
)

# 1. Initialize logging & database
logger = setup_nexus_logger()
db = GamingDatabase("nexus_gaming.db")
resolver = GameMetadataResolver(db, rawg_api_key=os.getenv("RAWG_API_KEY"))

# 2. Discord bot setup
intents = discord.Intents.default()
intents.presences = True  # Required for tracking game activities!
intents.members = True
intents.voice_states = True  # Required for tracking voice channels!
bot = commands.Bot(command_prefix="!", intents=intents)

def get_current_live_games():
    """Builds current top_played_games snapshot from bot's internal cache."""
    # (Your bot already has this logic to serve /api/public_stats)
    games_map = {}
    for guild in bot.guilds:
        for member in guild.members:
            act = extract_game_activity(member)
            if act:
                gname = act["game_name"]
                if gname not in games_map:
                    games_map[gname] = {
                        "name": gname,
                        "count": 0,
                        "players": [],
                        "player_details": []
                    }
                games_map[gname]["count"] += 1
                games_map[gname]["players"].append(act["username"])
                # Public payload: display name + avatar only, never raw IDs.
                games_map[gname]["player_details"].append({
                    "name": act["username"],
                    "avatar": act["avatar"],
                    "details": act["details"],
                    "start_timestamp": act["start_timestamp"]
                })
    return list(games_map.values())

# 3. Setup WebSocket manager and REST routers
ws_manager = LiveGamesWebSocketManager(get_current_snapshot_callback=get_current_live_games)
stats_router = StatsApiRouter(db, resolver)
public_router = PublicApiRouter(db)
_tracker_cfg = game_tracker.load_tracker_config()

# 4. Hook into presenceUpdate event (REAL game sessions -> game_sessions table).
# Requires the GuildPresences privileged intent BOTH in code (below) and in the
# Discord Developer Portal (Bot > Privileged Gateway Intents > Presence Intent).
@bot.event
async def on_presence_update(before: discord.Member, after: discord.Member):
    now_ms = int(__import__("time").time() * 1000)
    old_act, new_act = game_tracker.diff_presence(before, after, _tracker_cfg)
    action = game_tracker.handle_presence_update(
        db, before, after, now_ms=now_ms, cfg=_tracker_cfg,
        guild_id=str(getattr(after.guild, "id", "") if getattr(after, "guild", None) else ""))
    try:
        public_router.invalidate_live()
    except Exception:
        pass
    if action in ("START", "SWITCH") and new_act:
        # Legacy sessions table kept for the old leaderboard endpoints.
        try:
            db.start_session(str(after.id), new_act["username"], new_act["game_name"],
                             new_act.get("start_timestamp") or now_ms)
        except Exception:
            pass
        await ws_manager.broadcast_delta(action="PLAYER_JOINED",
                                         game_name=new_act["game_name"], player_data=new_act)
    elif action == "STOP" and old_act:
        try:
            db.end_session(str(before.id if before is not None else after.id), now_ms)
        except Exception:
            pass
        await ws_manager.broadcast_delta(action="PLAYER_LEFT",
                                         game_name=old_act["game_name"], player_data=old_act)
    elif action == "UPDATE" and new_act:
        await ws_manager.broadcast_delta(action="PLAYER_UPDATED",
                                         game_name=new_act["game_name"], player_data=new_act)

# 5. Attach WebSocket & REST routes to existing aiohttp application
def setup_web_server(app: web.Application):
    ws_manager.attach_routes(app, path="/ws/live-games")
    stats_router.attach_routes(app)
    public_router.attach_routes(app, bot_guilds_provider=lambda: list(bot.guilds))
    # Background refresh: live snapshot ~4s, most-played 60s. Requests serve
    # pre-built bytes only; prewarmed on startup so the first request is warm.
    public_router.start_background(app)
    # (Your existing routes /api/public_stats and /api/bot_data stay untouched)

    # ── Voice-live endpoint: same {"count", "members"} shape the dashboard
    # and api/voice_live.js already consume, plus server-computed
    # elapsed_seconds and real mute flags (see voice_tracker for the schema).
    async def voice_live(request: web.Request) -> web.Response:
        payload = build_voice_live_payload(db, list(bot.guilds))
        return web.json_response(payload)
    app.router.add_get("/api/voice_live", voice_live)


# 6. Voice tracking: reconcile on (re)connect, track every state change.
#    Copy these two handlers into your real bot file (this file is reference
#    only and is NOT uploaded). Requires intents.voice_states = True.
@bot.event
async def on_ready():
    report = reconcile_voice_sessions(db, list(bot.guilds))
    logger.info(
        "[VOICE] Reconcile on ready: closed=%d restarted=%d opened=%d",
        len(report["closed_stale"]), len(report["restarted"]), len(report["opened_fresh"])
    )
    # Game sessions: close orphans at last_seen, rebuild live set from members,
    # prune >30d history, then start the 60s heartbeat + daily prune loops.
    try:
        import time as _t
        now_ms = int(_t.time() * 1000)
        orphaned = db.close_orphaned_game_sessions(now_ms=now_ms)
        live = game_tracker.scan_live_members(list(bot.guilds), _tracker_cfg)
        for uid, act in live.items():
            db.open_game_session(guild_id=act.get("guild_id", ""), user_id=uid,
                                 username=act["username"], avatar_url=act["avatar"],
                                 game_key=act["game_key"], game_name=act["game_name"],
                                 details=act.get("details", ""), state=act.get("state", ""),
                                 started_at=act.get("start_timestamp") or now_ms, now_ms=now_ms)
        pruned = db.prune_old_game_sessions(now_ms=now_ms)
        logger.info("[GAMES] Boot rebuild: orphans=%d live=%d pruned=%d",
                    orphaned, len(live), pruned)
    except Exception as e:
        logger.warning("[GAMES] Boot rebuild failed: %s", e)
    bot.loop.create_task(_game_heartbeat_loop())
    bot.loop.create_task(_game_prune_loop())


async def _game_heartbeat_loop():
    """60s heartbeat: refresh last_seen for everyone still playing."""
    import asyncio as _aio
    import time as _t
    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            now_ms = int(_t.time() * 1000)
            live = game_tracker.scan_live_members(list(bot.guilds), _tracker_cfg)
            for uid, act in live.items():
                try:
                    db.heartbeat_game_session(uid, act["game_key"], now_ms=now_ms,
                                              details=act.get("details", ""),
                                              state=act.get("state", ""))
                except Exception:
                    pass
            try:
                public_router.invalidate_live()
            except Exception:
                pass
        except Exception:
            pass
        try:
            await _aio.sleep(60)
        except Exception:
            break


async def _game_prune_loop():
    import asyncio as _aio
    await bot.wait_until_ready()
    while not bot.is_closed():
        try:
            await _aio.sleep(24 * 3600)
            try:
                import time as _t
                db.prune_old_game_sessions(now_ms=int(_t.time() * 1000))
            except Exception:
                pass
        except Exception:
            break


@bot.event
async def on_voice_state_update(member: discord.Member,
                                before: discord.VoiceState,
                                after: discord.VoiceState):
    # Join / leave (incl. moderator disconnect) / move (incl. AFK moves).
    # Mute toggles need no DB write: flags are read live in the payload.
    # Bots are ignored here and never accrue ranked voice time.
    handle_voice_state_update(db, member, before, after)
