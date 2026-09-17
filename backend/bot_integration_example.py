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

# 1. Initialize logging & database
logger = setup_nexus_logger()
db = GamingDatabase("nexus_gaming.db")
resolver = GameMetadataResolver(db, rawg_api_key=os.getenv("RAWG_API_KEY"))

# 2. Discord bot setup
intents = discord.Intents.default()
intents.presences = True  # Required for tracking game activities!
intents.members = True
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
