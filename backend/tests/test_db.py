"""
backend/tests/test_db.py - Unit test for SQLite database operations
"""

import os
import sys
import tempfile
import time

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend.db import GamingDatabase

def run_tests():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = os.path.join(tmpdir, "test_nexus.db")
        db = GamingDatabase(db_path)

        print("[TEST] Testing start_session...")
        now = int(time.time() * 1000)
        s1 = db.start_session("12345", "Dodam", "PUBG: BATTLEGROUNDS", now - 3600000)
        assert s1 is not None, "Failed to start session 1"

        print("[TEST] Testing end_session...")
        ended = db.end_session("12345", now)
        assert ended == 1, f"Expected 1 ended session, got {ended}"

        print("[TEST] Testing second session...")
        s2 = db.start_session("67890", "PaMuJiThA", "Brawlhalla", now - 7200000)
        db.end_session("67890", now)

        print("[TEST] Testing most_played query...")
        most_played = db.get_most_played(period="week")
        assert len(most_played) == 2, f"Expected 2 games in most_played, got {len(most_played)}"
        print(f"[TEST] Most played result: {most_played}")

        print("[TEST] Testing leaderboard query...")
        leaderboard = db.get_leaderboard(period="week")
        assert len(leaderboard) == 2, f"Expected 2 users in leaderboard, got {len(leaderboard)}"
        print(f"[TEST] Leaderboard result: {leaderboard}")

        print("[TEST] Testing user history...")
        hist = db.get_user_history("12345")
        assert len(hist) == 1, f"Expected 1 history item, got {len(hist)}"
        assert hist[0]["game_name"] == "PUBG: BATTLEGROUNDS"

        print("[TEST] Testing games metadata cache...")
        db.save_cached_game("Valorant", "https://cover.url", "Tactical FPS", "rawg")
        cached = db.get_cached_game("valorant")
        assert cached is not None, "Failed to get cached game"
        assert cached["cover_url"] == "https://cover.url"
        assert cached["genre"] == "Tactical FPS"

        print("[TEST] ALL TESTS PASSED SUCCESSFULLY! [OK]")

if __name__ == "__main__":
    run_tests()
