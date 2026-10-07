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
        # check_same_thread=False: the public API runs SQLite reads in an
        # executor (asyncio.to_thread); each call still opens and closes its
        # own short-lived connection, so no connection crosses threads.
        conn = sqlite3.connect(self.db_path, timeout=10.0, check_same_thread=False)
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
            # Voice sessions table for voice-channel presence tracking.
            # started_at/ended_at are UTC epoch MILLISECONDS. ended_at IS NULL = open.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS voice_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    discord_user_id TEXT NOT NULL,
                    username TEXT NOT NULL,
                    channel_id TEXT,
                    channel_name TEXT,
                    started_at INTEGER NOT NULL,
                    ended_at INTEGER,
                    is_bot INTEGER NOT NULL DEFAULT 0
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_voice_user ON voice_sessions(discord_user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_voice_started ON voice_sessions(started_at);")
            # Migrate older voice_sessions tables that predate channel/is_bot columns.
            existing_cols = {row[1] for row in cursor.execute("PRAGMA table_info(voice_sessions)").fetchall()}
            if "channel_id" not in existing_cols:
                cursor.execute("ALTER TABLE voice_sessions ADD COLUMN channel_id TEXT")
            if "channel_name" not in existing_cols:
                cursor.execute("ALTER TABLE voice_sessions ADD COLUMN channel_name TEXT")
            if "is_bot" not in existing_cols:
                cursor.execute("ALTER TABLE voice_sessions ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0")
            # ── Game sessions (Discord presence Playing/Competing). Additive only.
            # started_at/last_seen/ended_at are UTC epoch MILLISECONDS. ended_at NULL = open.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS game_sessions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    guild_id TEXT NOT NULL DEFAULT '',
                    user_id TEXT NOT NULL,
                    username TEXT NOT NULL DEFAULT '',
                    avatar_url TEXT NOT NULL DEFAULT '',
                    game_key TEXT NOT NULL,
                    game_name TEXT NOT NULL,
                    details TEXT NOT NULL DEFAULT '',
                    state TEXT NOT NULL DEFAULT '',
                    started_at INTEGER NOT NULL,
                    last_seen INTEGER NOT NULL,
                    ended_at INTEGER
                );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_gamesess_game ON game_sessions(game_key);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_gamesess_user ON game_sessions(user_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_gamesess_started ON game_sessions(started_at);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_gamesess_open ON game_sessions(ended_at);")
            gcols = {row[1] for row in cursor.execute("PRAGMA table_info(game_sessions)").fetchall()}
            for _col, _ddl in (
                ("guild_id", "ALTER TABLE game_sessions ADD COLUMN guild_id TEXT NOT NULL DEFAULT ''"),
                ("avatar_url", "ALTER TABLE game_sessions ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''"),
                ("details", "ALTER TABLE game_sessions ADD COLUMN details TEXT NOT NULL DEFAULT ''"),
                ("state", "ALTER TABLE game_sessions ADD COLUMN state TEXT NOT NULL DEFAULT ''"),
                ("last_seen", "ALTER TABLE game_sessions ADD COLUMN last_seen INTEGER NOT NULL DEFAULT 0"),
            ):
                if _col not in gcols:
                    cursor.execute(_ddl)
            # ── Privacy opt-outs. Additive only; public output excludes these users.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS privacy_optouts (
                    user_id TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL
                );
            """)
            # ── Spotify opt-outs (!spotify off/on). Independent of the global
            # privacy opt-out: opted-out users are hidden from /api/public/spotify
            # only. The global privacy table still hides a user everywhere.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS spotify_optouts (
                    user_id TEXT PRIMARY KEY,
                    created_at INTEGER NOT NULL
                );
            """)
            # ── Captured Rich Presence artwork, per GAME (never per user).
            # No Discord user IDs in this table. image_url is always a
            # discord CDN / media proxy URL; the website never hotlinks it -
            # the bot downloads it once to images/games/auto/<key>.jpg.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS game_assets (
                    game_key TEXT PRIMARY KEY,
                    image_url TEXT NOT NULL,
                    source_app_id TEXT NOT NULL DEFAULT '',
                    updated_at INTEGER NOT NULL
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

    # ── Voice sessions ──────────────────────────────────────────────
    # All timestamps are UTC epoch MILLISECONDS. ended_at IS NULL = open.
    # Bots must never accrue voice time: pass is_bot=1 (or use close to
    # exclude them) and keep them out of ranking queries (is_bot = 0).

    def open_voice_session(self, discord_user_id: str, username: str,
                           channel_id: Optional[str] = None,
                           channel_name: Optional[str] = None,
                           started_at: Optional[int] = None,
                           is_bot: bool = False) -> int:
        """Open a voice session, first closing any other open one for this user.

        Closing-then-opening keeps per-channel accuracy on moves (the old row
        ends exactly when the new row starts: no gap, no overlap).
        """
        now = started_at if started_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE voice_sessions SET ended_at = ? WHERE discord_user_id = ? AND ended_at IS NULL",
                (now, discord_user_id)
            )
            cursor.execute(
                """INSERT INTO voice_sessions
                   (discord_user_id, username, channel_id, channel_name, started_at, ended_at, is_bot)
                   VALUES (?, ?, ?, ?, ?, NULL, ?)""",
                (discord_user_id, username, channel_id, channel_name, now, 1 if is_bot else 0)
            )
            session_id = cursor.lastrowid
            conn.commit()
            return session_id

    def close_voice_session(self, discord_user_id: str, ended_at: Optional[int] = None) -> int:
        """Close open voice session(s) for this user. Clamps end >= start so
        clock skew can never create negative durations in historical totals."""
        now = ended_at if ended_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, started_at FROM voice_sessions WHERE discord_user_id = ? AND ended_at IS NULL",
                (discord_user_id,)
            )
            rows = cursor.fetchall()
            for row in rows:
                sane_end = max(now, row["started_at"])
                cursor.execute("UPDATE voice_sessions SET ended_at = ? WHERE id = ?", (sane_end, row["id"]))
            conn.commit()
            return len(rows)

    def close_all_open_voice_sessions(self, ended_at: Optional[int] = None) -> List[str]:
        """Close EVERY open voice session (reconcile/reset). Returns affected user ids."""
        now = ended_at if ended_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id, discord_user_id, started_at FROM voice_sessions WHERE ended_at IS NULL")
            rows = cursor.fetchall()
            for row in rows:
                sane_end = max(now, row["started_at"])
                cursor.execute("UPDATE voice_sessions SET ended_at = ? WHERE id = ?", (sane_end, row["id"]))
            conn.commit()
            return [row["discord_user_id"] for row in rows]

    def get_open_voice_sessions(self) -> List[Dict[str, Any]]:
        """All currently open (unclosed) voice sessions."""
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, discord_user_id, username, channel_id, channel_name,
                          started_at, ended_at, is_bot
                   FROM voice_sessions WHERE ended_at IS NULL ORDER BY started_at ASC"""
            )
            return [dict(row) for row in cursor.fetchall()]

    def find_overlong_open_sessions(self, now_ms: Optional[int] = None,
                                    max_open_ms: int = 24 * 3600 * 1000) -> List[Dict[str, Any]]:
        """Open sessions older than max_open_ms. These are the stale-timer
        suspects (bot was offline while the member left, or a missed event)."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        overlong = []
        for row in self.get_open_voice_sessions():
            age = now - row["started_at"]
            if age < 0 or age > max_open_ms:
                overlong.append({**row, "open_ms": age})
        return overlong

    def get_voice_totals(self, period: str = "week", limit: int = 10) -> List[Dict[str, Any]]:
        """Voice-hours ranking. Excludes bots. Caps any single session's
        credited time at 24h and ignores negative spans so one stale row can
        never dominate a leaderboard. Does NOT modify stored data."""
        now = int(time.time() * 1000)
        ms_in_day = 86400 * 1000
        cutoff = 0
        if period == "day":
            cutoff = now - ms_in_day
        elif period == "week":
            cutoff = now - (7 * ms_in_day)
        elif period == "month":
            cutoff = now - (30 * ms_in_day)
        cap_ms = 24 * 3600 * 1000
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT discord_user_id, username, started_at,
                       COALESCE(ended_at, ?) AS ended_at
                FROM voice_sessions
                WHERE started_at >= ? AND is_bot = 0
            """, (now, cutoff))
            totals: Dict[str, Dict[str, Any]] = {}
            for row in cursor.fetchall():
                span = max(0, min(row["ended_at"] - row["started_at"], cap_ms))
                if span <= 0:
                    continue
                entry = totals.setdefault(row["discord_user_id"], {
                    "discord_user_id": row["discord_user_id"],
                    "username": row["username"],
                    "session_count": 0,
                    "total_seconds": 0,
                })
                entry["session_count"] += 1
                entry["total_seconds"] += span // 1000
            ranked = sorted(totals.values(), key=lambda e: e["total_seconds"], reverse=True)[:limit]
            for idx, entry in enumerate(ranked, 1):
                entry["rank"] = idx
                entry["total_hours"] = round(entry["total_seconds"] / 3600, 1)
            return ranked

    # ── Game sessions (presence Playing/Competing) ────────────────────
    # UTC epoch MILLISECONDS everywhere. ended_at IS NULL = open session.

    def open_game_session(self, guild_id: str, user_id: str, username: str,
                          avatar_url: str, game_key: str, game_name: str,
                          details: str = "", state: str = "",
                          started_at: Optional[int] = None,
                          now_ms: Optional[int] = None) -> int:
        """Close this user's other open game rows, then open the new game."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        start = started_at if started_at is not None else now
        if start > now:
            start = now
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE game_sessions SET ended_at = ? WHERE user_id = ? AND ended_at IS NULL",
                (now, str(user_id)),
            )
            cursor.execute(
                """INSERT INTO game_sessions
                   (guild_id, user_id, username, avatar_url, game_key, game_name,
                    details, state, started_at, last_seen, ended_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)""",
                (str(guild_id or ""), str(user_id), str(username or ""),
                 str(avatar_url or ""), str(game_key), str(game_name),
                 str(details or "")[:140], str(state or "")[:140], int(start), int(now)),
            )
            sid = cursor.lastrowid
            conn.commit()
            return int(sid)

    def heartbeat_game_session(self, user_id: str, game_key: str,
                               now_ms: Optional[int] = None,
                               details: str = "", state: str = "") -> int:
        """Refresh last_seen (60s heartbeat). Returns rows touched."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE game_sessions SET last_seen = ?, details = ?, state = ?
                   WHERE user_id = ? AND game_key = ? AND ended_at IS NULL""",
                (int(now), str(details or "")[:140], str(state or "")[:140],
                 str(user_id), str(game_key)),
            )
            conn.commit()
            return cursor.rowcount

    def close_user_game_sessions(self, user_id: str, ended_at: Optional[int] = None) -> int:
        """Close all open game rows for a user (stop/switch/offline)."""
        now = ended_at if ended_at is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, last_seen, started_at FROM game_sessions WHERE user_id = ? AND ended_at IS NULL",
                (str(user_id),),
            )
            rows = cursor.fetchall()
            for row in rows:
                sane_end = max(int(now), int(row["last_seen"] or row["started_at"]))
                cursor.execute("UPDATE game_sessions SET ended_at = ? WHERE id = ?",
                               (sane_end, row["id"]))
            conn.commit()
            return len(rows)

    def close_orphaned_game_sessions(self, now_ms: Optional[int] = None) -> int:
        """On bot startup: close every still-open row at its last_seen (honest)."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT id, last_seen, started_at FROM game_sessions WHERE ended_at IS NULL")
            rows = cursor.fetchall()
            for row in rows:
                end = int(row["last_seen"] or row["started_at"])
                if end > now:
                    end = now
                cursor.execute("UPDATE game_sessions SET ended_at = ? WHERE id = ?",
                               (end, row["id"]))
            conn.commit()
            return len(rows)

    def close_open_game_sessions_for_names(self, names, now_ms: Optional[int] = None) -> int:
        """Close still-open rows for ignored apps (boot cleanup).

        `names` are exact lowercase app names (ignore_apps entries); rows
        match on LOWER(game_name) or the slug LOWER(game_key). Ends at
        last_seen (honest), never the future. Returns rows closed.
        """
        import re as _re
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        lowers = {str(n).lower().strip() for n in (names or []) if str(n).strip()}
        if not lowers:
            return 0
        keys = {_re.sub(r"[^a-z0-9]+", "-", n).strip("-") for n in lowers}
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, game_key, game_name, last_seen, started_at
                   FROM game_sessions WHERE ended_at IS NULL""")
            rows = cursor.fetchall()
            count = 0
            for row in rows:
                if str(row["game_name"] or "").lower().strip() in lowers or \
                        str(row["game_key"] or "").lower().strip() in keys:
                    end = int(row["last_seen"] or row["started_at"])
                    if end > now:
                        end = now
                    cursor.execute("UPDATE game_sessions SET ended_at = ? WHERE id = ?",
                                   (end, row["id"]))
                    count += 1
            conn.commit()
            return count

    def prune_old_game_sessions(self, older_than_ms: Optional[int] = None,
                                now_ms: Optional[int] = None) -> int:
        """Delete sessions that ended (or started) more than 30 days ago."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        cutoff = now - (older_than_ms if older_than_ms is not None else 30 * 86400 * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "DELETE FROM game_sessions WHERE COALESCE(ended_at, started_at) < ?",
                (int(cutoff),),
            )
            conn.commit()
            return cursor.rowcount

    def get_open_game_sessions(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, guild_id, user_id, username, avatar_url, game_key,
                          game_name, details, state, started_at, last_seen, ended_at
                   FROM game_sessions WHERE ended_at IS NULL ORDER BY started_at ASC""")
            return [dict(r) for r in cursor.fetchall()]

    # ── Privacy opt-outs ────────────────────────────────────────────
    def set_privacy_optout(self, user_id: str, opted_out: bool = True) -> None:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if opted_out:
                cursor.execute(
                    "INSERT OR IGNORE INTO privacy_optouts (user_id, created_at) VALUES (?, ?)",
                    (str(user_id), int(time.time() * 1000)),
                )
            else:
                cursor.execute("DELETE FROM privacy_optouts WHERE user_id = ?",
                               (str(user_id),))
            conn.commit()

    def get_privacy_optouts(self) -> List[str]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT user_id FROM privacy_optouts")
            return [str(r["user_id"]) for r in cursor.fetchall()]

    # ── Spotify opt-outs (!spotify off / !spotify on) ────────────────
    def set_spotify_optout(self, user_id: str, opted_out: bool = True) -> None:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            if opted_out:
                cursor.execute(
                    "INSERT OR IGNORE INTO spotify_optouts (user_id, created_at) VALUES (?, ?)",
                    (str(user_id), int(time.time() * 1000)),
                )
            else:
                cursor.execute("DELETE FROM spotify_optouts WHERE user_id = ?",
                               (str(user_id),))
            conn.commit()

    def get_spotify_optouts(self) -> List[str]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT user_id FROM spotify_optouts")
            return [str(r["user_id"]) for r in cursor.fetchall()]

    # ── Captured game artwork (Rich Presence large/small image) ──────
    # Per game_key only. Callers must skip opted-out members BEFORE
    # calling save (their sessions must not create or update assets).

    def save_game_asset(self, game_key: str, image_url: str,
                        source_app_id: str = "") -> bool:
        """Remember the artwork URL for a game. Writes ONLY when the URL
        changed (or the row is new). Returns True when it changed."""
        key, url = str(game_key or "").strip(), str(image_url or "").strip()
        if not key or not url:
            return False
        now = int(time.time() * 1000)
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT image_url FROM game_assets WHERE game_key = ?",
                           (key,))
            row = cursor.fetchone()
            if row is not None and str(row["image_url"]) == url:
                return False
            cursor.execute(
                """INSERT INTO game_assets (game_key, image_url, source_app_id, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(game_key) DO UPDATE SET
                       image_url = excluded.image_url,
                       source_app_id = excluded.source_app_id,
                       updated_at = excluded.updated_at""",
                (key, url, str(source_app_id or ""), now),
            )
            conn.commit()
            return True

    def get_game_asset(self, game_key: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT game_key, image_url, source_app_id, updated_at"
                " FROM game_assets WHERE game_key = ?", (str(game_key),))
            row = cursor.fetchone()
            return dict(row) if row else None

    def get_game_assets(self) -> List[Dict[str, Any]]:
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT game_key, image_url, source_app_id, updated_at"
                " FROM game_assets ORDER BY game_key ASC")
            return [dict(r) for r in cursor.fetchall()]

    def get_game_most_played(self, range_ms: int = 7 * 86400 * 1000,
                             limit: int = 9,
                             now_ms: Optional[int] = None,
                             exclude_user_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
        """Per-GAME aggregation. Clips sessions overlapping the range edges;
        active sessions count up to now. Sorted by total hours desc."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        start = int(now - range_ms)
        excluded = set(str(u) for u in (exclude_user_ids or []))
        try:
            excluded.update(self.get_privacy_optouts())
        except Exception:
            pass
        with self._get_conn() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT game_key, game_name, user_id, username, avatar_url,
                          started_at, COALESCE(ended_at, ?) AS ended_at
                   FROM game_sessions WHERE started_at < ? AND COALESCE(ended_at, ?) > ?""",
                (now, now, now, start),
            )
            agg: Dict[str, Dict[str, Any]] = {}
            users: Dict[str, Dict[str, set]] = {}
            for row in cursor.fetchall():
                uid = str(row["user_id"])
                if uid in excluded:
                    continue
                s = max(int(row["started_at"]), start)
                e = min(int(row["ended_at"]), now)
                span_ms = e - s
                if span_ms <= 0:
                    continue
                key = str(row["game_key"])
                entry = agg.setdefault(key, {
                    "game_key": key, "game_name": str(row["game_name"]),
                    "total_ms": 0, "sessions": 0,
                })
                entry["total_ms"] += span_ms
                entry["sessions"] += 1
                bucket = users.setdefault(key, {})
                if uid not in bucket:
                    bucket[uid] = {"name": str(row["username"] or "Member"),
                                   "avatar": str(row["avatar_url"] or "")}
            ranked = sorted(agg.values(), key=lambda x: x["total_ms"], reverse=True)[:int(limit)]
            out = []
            for idx, entry in enumerate(ranked, 1):
                sec = int(entry["total_ms"] // 1000)
                members = users.get(entry["game_key"], {})
                top = [{"name": v.get("name", "Member"), "avatar": v.get("avatar", "")}
                       for uid, v in list(members.items())[:4]]
                out.append({
                    "rank": idx,
                    "game_key": entry["game_key"],
                    "name": entry["game_name"],
                    "unique_players": len(members),
                    "total_seconds": sec,
                    "total_hours": round(sec / 3600, 1),
                    "sessions": entry["sessions"],
                    "top_players": top,
                })
            return out
