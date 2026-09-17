"""
backend/rawg.py - Automated Game Metadata Pipeline
Fetches official cover art and genre tags from RAWG / Steam CDN and caches them in SQLite.
"""

import os
import aiohttp
import logging
from typing import Dict, Any, Optional
from .db import GamingDatabase

logger = logging.getLogger("nexus.metadata")

DEFAULT_FALLBACK_COVER = "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80"
DEFAULT_FALLBACK_GENRE = "Live Gaming"

class GameMetadataResolver:
    def __init__(self, db: GamingDatabase, rawg_api_key: Optional[str] = None):
        self.db = db
        self.rawg_api_key = rawg_api_key or os.getenv("RAWG_API_KEY", "").strip()

    async def resolve(self, game_name: str) -> Dict[str, Any]:
        """
        Resolves game cover art and genre:
        1. Checks SQLite database cache.
        2. Queries RAWG API (if key available).
        3. Queries Steam Search API for official Steam CDN library cover.
        4. Falls back to default placeholder.
        """
        clean_name = (game_name or "").strip()
        if not clean_name:
            return {
                "name": "Unknown",
                "cover_url": DEFAULT_FALLBACK_COVER,
                "genre": DEFAULT_FALLBACK_GENRE,
                "source": "fallback"
            }

        # 1. Check local SQLite cache first
        cached = self.db.get_cached_game(clean_name)
        if cached and cached.get("cover_url"):
            return cached

        cover_url = None
        genre = None
        source = "fallback"

        # 2. Try RAWG API if key is present
        if self.rawg_api_key:
            try:
                cover_url, genre = await self._fetch_from_rawg(clean_name)
                if cover_url:
                    source = "rawg"
            except Exception as e:
                logger.warning(f"[Metadata] RAWG API lookup failed for '{clean_name}': {e}")

        # 3. Fallback to Steam CDN search if RAWG was unavailable or gave no result
        if not cover_url:
            try:
                cover_url, genre = await self._fetch_from_steam(clean_name)
                if cover_url:
                    source = "steam"
            except Exception as e:
                logger.warning(f"[Metadata] Steam search lookup failed for '{clean_name}': {e}")

        # 4. Final safety fallback
        if not cover_url:
            cover_url = DEFAULT_FALLBACK_COVER
            genre = genre or DEFAULT_FALLBACK_GENRE
            source = "default"

        # Cache in database
        self.db.save_cached_game(clean_name, cover_url, genre or DEFAULT_FALLBACK_GENRE, source)

        return {
            "name": clean_name,
            "cover_url": cover_url,
            "genre": genre or DEFAULT_FALLBACK_GENRE,
            "source": source
        }

    async def _fetch_from_rawg(self, name: str):
        url = f"https://api.rawg.io/api/games?key={self.rawg_api_key}&search={aiohttp.helpers.quote(name)}&page_size=1"
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=4.0)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    results = data.get("results", [])
                    if results:
                        match = results[0]
                        img = match.get("background_image")
                        genres = match.get("genres", [])
                        genre_name = genres[0]["name"] if genres else DEFAULT_FALLBACK_GENRE
                        return img, genre_name
        return None, None

    async def _fetch_from_steam(self, name: str):
        url = f"https://store.steampowered.com/api/storesearch/?term={aiohttp.helpers.quote(name)}&l=english&cc=US"
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=3.5)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    items = data.get("items", [])
                    if items:
                        app_id = items[0].get("id")
                        if app_id:
                            # Official Steam 600x900 vertical box art
                            steam_cover = f"https://steamcdn-a.akamaihd.net/steam/apps/{app_id}/library_600x900_2x.jpg"
                            return steam_cover, "PC Gaming"
        return None, None
