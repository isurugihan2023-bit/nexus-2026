"""
backend/db.py - SQLite Persistence Layer for Ninja Nexus Live Gaming
Tracks live gaming sessions, computes leaderboards and most-played statistics,
and provides a caching layer for game metadata.
"""

import sqlite3
import time
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("nexus.db")

class GamingDatabase:
    def __init__(self, db_path: str = "nexus_gaming.db"):
        self.db_path = db_path
        self.init_db()

    from contextlib import contextmanager

    @contextmanager
    def _get_conn(self):
        conn = sqlite3.connect(self.db_path, timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()

    def init_db(self):
        """Creates tables and indexes if they do not already exist."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            
            # Sessions table for player history and leaderboards
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    discord_user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    game_name TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    ended_at INTEGER
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_game ON sessions(game_name);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(discord_user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);")

            # Games table for automated RAWG / Steam metadata caching
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    name TEXT PRIMARY KEY,
                    cover_url TEXT,
                    genre TEXT,
                    source TEXT,
                    fetched_at INTEGER
                );
            """)
            conn.commit()
            logger.info(f"[DB] Initialized SQLite database at {self.db_path}")

    def start_session(self, discord_user_id: str, username: str, game_name: str, started_at: Optional[int] = None) -> int:
        """Close any dangling session for this user and record a new active session."""
        now = started_at or int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            # Close active previous session if any
            cursor.execute(
                "UPDATE sessions SET ended_at = ? WHERE discord_user_id = ? AND ended_at IS NULL",
                (now, discord_user_id)
            )
            # Insert new active session
            cursor.execute(
                "INSERT INTO sessions (discord_user_id, username, game_name, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)",
                (discord_user_id, username, game_name, now)
            )
            session_id = cursor.lastrowid
            conn.commit()
            return session_id

    def end_session(self, discord_user_id: str, ended_at: Optional[int] = None) -> int:
        """Mark active session for this user as ended."""
        now = ended_at or int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE sessions SET ended_at = ? WHERE discord_user_id = ? AND ended_at IS NULL",
                (now, discord_user_id)
            )
            affected = cursor.rowcount
            conn.commit()
            return affected

    def get_most_played(self, period: str = "week", limit: int = 10) -> List[Dict[str, Any]]:
        """
        Aggregate total playtime by game for the given timeframe.
        period: 'day' | 'week' | 'month' | 'all'
        """
        now = int(time.time() * 1000)
        ms_in_day = 86400 * 1000
        cutoff = 0
        if period == "day":
            cutoff = now - ms_in_day
        elif period == "week":
            cutoff = now - (7 * ms_in_day)
        elif period == "month":
            cutoff = now - (30 * ms_in_day)

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    game_name,
                    COUNT(id) as total_sessions,
                    COUNT(DISTINCT discord_user_id) as unique_players,
                    SUM(COALESCE(ended_at, ?) - started_at) / 1000 as total_seconds
                FROM sessions
                WHERE started_at >= ?
                GROUP BY game_name
                HAVING total_seconds > 0
                ORDER BY total_seconds DESC
                LIMIT ?
            """, (now, cutoff, limit))

            results = []
            for row in cursor.fetchall():
                sec = max(0, int(row["total_seconds"] or 0))
                hours = round(sec / 3600, 1)
                results.append({
                    "game_name": row["game_name"],
                    "total_sessions": row["total_sessions"],
                    "unique_players": row["unique_players"],
                    "total_seconds": sec,
                    "total_hours": hours
                })
            return results

    def get_leaderboard(self, period: str = "week", limit: int = 10) -> List[Dict[str, Any]]:
        """
        Aggregate total member playtime for the given timeframe.
        period: 'day' | 'week' | 'month' | 'all'
        """
        now = int(time.time() * 1000)
        ms_in_day = 86400 * 1000
        cutoff = 0
        if period == "day":
            cutoff = now - ms_in_day
        elif period == "week":
            cutoff = now - (7 * ms_in_day)
        elif period == "month":
            cutoff = now - (30 * ms_in_day)

        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT 
                    discord_user_id,
                    username,
                    COUNT(id) as session_count,
                    SUM(COALESCE(ended_at, ?) - started_at) / 1000 as total_seconds
                FROM sessions
                WHERE started_at >= ?
                GROUP BY discord_user_id, username
                HAVING total_seconds > 0
                ORDER BY total_seconds DESC
                LIMIT ?
            """, (now, cutoff, limit))

            results = []
            for idx, row in enumerate(cursor.fetchall(), 1):
                sec = max(0, int(row["total_seconds"] or 0))
                hours = round(sec / 3600, 1)
                results.append({
                    "rank": idx,
                    "discord_user_id": row["discord_user_id"],
                    "username": row["username"],
                    "session_count": row["session_count"],
                    "total_seconds": sec,
                    "total_hours": hours
                })
            return results

    def get_user_history(self, discord_user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Retrieve recent session history for a specific member."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, game_name, started_at, ended_at
                FROM sessions
                WHERE discord_user_id = ?
                ORDER BY started_at DESC
                LIMIT ?
            """, (discord_user_id, limit))

            results = []
            for row in cursor.fetchall():
                started = row["started_at"]
                ended = row["ended_at"]
                duration_sec = int(((ended or int(time.time() * 1000)) - started) / 1000)
                results.append({
                    "id": row["id"],
                    "game_name": row["game_name"],
                    "started_at": started,
                    "ended_at": ended,
                    "is_active": ended is None,
                    "duration_seconds": max(0, duration_sec)
                })
            return results

    def get_cached_game(self, name: str) -> Optional[Dict[str, Any]]:
        """Check if metadata for a game exists in the cache."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name, cover_url, genre, source, fetched_at FROM games WHERE LOWER(name) = LOWER(?)", (name,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None

    def save_cached_game(self, name: str, cover_url: str, genre: str, source: str = "rawg"):
        """Save or update game metadata in SQLite."""
        now = int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO games (name, cover_url, genre, source, fetched_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    cover_url = excluded.cover_url,
                    genre = excluded.genre,
                    source = excluded.source,
                    fetched_at = excluded.fetched_at
            """, (name, cover_url, genre, source, now))
            conn.commit()
