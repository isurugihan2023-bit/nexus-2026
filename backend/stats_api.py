"""
backend/stats_api.py - Additive aiohttp REST Routes for Statistics & Game Metadata
Mounts onto the existing bot aiohttp application without altering /api/public_stats.
"""

from aiohttp import web
import json
import logging
from typing import Optional
from .db import GamingDatabase
from .rawg import GameMetadataResolver

logger = logging.getLogger("nexus.api")

def set_cors_and_no_cache_headers(response: web.Response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

class StatsApiRouter:
    def __init__(self, db: GamingDatabase, resolver: Optional[GameMetadataResolver] = None):
        self.db = db
        self.resolver = resolver or GameMetadataResolver(db)

    async def get_most_played(self, request: web.Request) -> web.Response:
        """GET /api/stats/most-played?period=week|month|all"""
        period = request.query.get("period", "week").lower()
        limit = min(50, max(1, int(request.query.get("limit", 10))))
        games = self.db.get_most_played(period=period, limit=limit)
        res = web.json_response({
            "status": "success",
            "period": period,
            "count": len(games),
            "games": games
        })
        return set_cors_and_no_cache_headers(res)

    async def get_leaderboard(self, request: web.Request) -> web.Response:
        """GET /api/stats/leaderboard?period=week|month|all"""
        period = request.query.get("period", "week").lower()
        limit = min(50, max(1, int(request.query.get("limit", 10))))
        leaderboard = self.db.get_leaderboard(period=period, limit=limit)
        res = web.json_response({
            "status": "success",
            "period": period,
            "count": len(leaderboard),
            "leaderboard": leaderboard
        })
        return set_cors_and_no_cache_headers(res)

    async def get_user_history(self, request: web.Request) -> web.Response:
        """GET /api/stats/user/{discord_id}"""
        discord_id = request.match_info.get("discord_id", "").strip()
        if not discord_id:
            return set_cors_and_no_cache_headers(web.json_response({"error": "Missing discord_id"}, status=400))

        history = self.db.get_user_history(discord_user_id=discord_id, limit=25)
        res = web.json_response({
            "status": "success",
            "discord_user_id": discord_id,
            "session_count": len(history),
            "sessions": history
        })
        return set_cors_and_no_cache_headers(res)

    async def get_game_metadata(self, request: web.Request) -> web.Response:
        """GET /api/games/{name}"""
        game_name = request.match_info.get("name", "").strip()
        if not game_name:
            return set_cors_and_no_cache_headers(web.json_response({"error": "Missing game name"}, status=400))

        metadata = await self.resolver.resolve(game_name)
        res = web.json_response({
            "status": "success",
            "game": metadata
        })
        return set_cors_and_no_cache_headers(res)

    def attach_routes(self, app: web.Application):
        """Attaches additive stats and games routes to the main bot aiohttp application."""
        app.router.add_get("/api/stats/most-played", self.get_most_played)
        app.router.add_get("/api/stats/leaderboard", self.get_leaderboard)
        app.router.add_get("/api/stats/user/{discord_id}", self.get_user_history)
        app.router.add_get("/api/games/{name}", self.get_game_metadata)
        logger.info("[API] Successfully registered additive /api/stats and /api/games routes.")
