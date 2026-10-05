"""asset_store.py - FLAT-LAYOUT host file (upload next to dashboard.py).

Self-contained captured-artwork memory. Own SQLite file (game_assets.db,
same folder) - does NOT touch live_store.py or any other DB, so there is
no schema risk to your existing bot.

Table game_assets(game_key, image_url, source_app_id, updated_at):
per GAME only, never any Discord user IDs.

Stdlib only. No backend/ package needed.
"""

import os
import sqlite3
import time

DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "game_assets.db")


def _connect():
    conn = sqlite3.connect(DB_FILE, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS game_assets (
               game_key TEXT PRIMARY KEY,
               image_url TEXT NOT NULL,
               source_app_id TEXT NOT NULL DEFAULT '',
               updated_at INTEGER NOT NULL)""")
    conn.commit()
    return conn


def save_game_asset(game_key, image_url, source_app_id=""):
    """Remember the artwork URL for a game. Writes ONLY when the URL
    changed (or the row is new). Returns True when it changed."""
    key, url = str(game_key or "").strip(), str(image_url or "").strip()
    if not key or not url:
        return False
    conn = _connect()
    try:
        row = conn.execute("SELECT image_url FROM game_assets WHERE game_key = ?",
                           (key,)).fetchone()
        if row is not None and str(row["image_url"]) == url:
            return False
        conn.execute(
            """INSERT INTO game_assets (game_key, image_url, source_app_id, updated_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(game_key) DO UPDATE SET
                   image_url = excluded.image_url,
                   source_app_id = excluded.source_app_id,
                   updated_at = excluded.updated_at""",
            (key, url, str(source_app_id or ""), int(time.time() * 1000)))
        conn.commit()
        return True
    finally:
        conn.close()


def get_game_asset(game_key):
    conn = _connect()
    try:
        row = conn.execute(
            "SELECT game_key, image_url, source_app_id, updated_at"
            " FROM game_assets WHERE game_key = ?",
            (str(game_key),)).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
