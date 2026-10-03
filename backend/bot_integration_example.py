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

# 4. Hook into presenceUpdate event
@bot.event
async def on_presence_update(before: discord.Member, after: discord.Member):
    old_act = extract_game_activity(before)
    new_act = extract_game_activity(after)

    # Member started playing or switched game
    if new_act and (not old_act or old_act["game_name"] != new_act["game_name"]):
        # Update SQLite session
        db.start_session(new_act["player_id"], new_act["username"], new_act["game_name"], new_act["start_timestamp"])
        # Broadcast delta
        await ws_manager.broadcast_delta(
            action="PLAYER_JOINED",
            game_name=new_act["game_name"],
            player_data=new_act
        )
        logger.info(f"[PRESENCE] {new_act['username']} started playing {new_act['game_name']}")

    # Member stopped playing
    elif old_act and not new_act:
        db.end_session(old_act["player_id"])
        await ws_manager.broadcast_delta(
            action="PLAYER_LEFT",
            game_name=old_act["game_name"],
            player_data=old_act
        )
        logger.info(f"[PRESENCE] {old_act['username']} stopped playing {old_act['game_name']}")

    # Member updated details (e.g. changed map / in lobby)
    elif old_act and new_act and old_act["details"] != new_act["details"]:
        await ws_manager.broadcast_delta(
            action="PLAYER_UPDATED",
            game_name=new_act["game_name"],
            player_data=new_act
        )

# 5. Attach WebSocket & REST routes to existing aiohttp application
def setup_web_server(app: web.Application):
    ws_manager.attach_routes(app, path="/ws/live-games")
    stats_router.attach_routes(app)
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


@bot.event
async def on_voice_state_update(member: discord.Member,
                                before: discord.VoiceState,
                                after: discord.VoiceState):
    # Join / leave (incl. moderator disconnect) / move (incl. AFK moves).
    # Mute toggles need no DB write: flags are read live in the payload.
    # Bots are ignored here and never accrue ranked voice time.
    handle_voice_state_update(db, member, before, after)
