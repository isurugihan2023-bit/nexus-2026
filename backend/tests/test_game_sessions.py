"""backend/tests/test_game_sessions.py - game_sessions aggregation + presence rules."""
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend.db import GamingDatabase
from backend import game_tracker as gt

H = 3600 * 1000
NOW = 1789744800000


class FakeAct:
    def __init__(self, name, atype=0, details="", state="", start=None):
        self.name = name
        self.type = atype
        self.details = details
        self.state = state
        self.timestamps = {"start": start} if start else {}
        self.start = None


class FakeAvatar:
    def __init__(self, url="https://cdn/avatar.png"):
        self.url = url


class FakeMember:
    def __init__(self, uid, name, acts, bot=False):
        self.id = uid
        self.name = name
        self.display_name = name
        self.bot = bot
        self.activities = acts
        self.display_avatar = FakeAvatar()


def fresh_db(tmp):
    return GamingDatabase(os.path.join(tmp, "games.db"))


def run_tests():
    with tempfile.TemporaryDirectory() as tmp:
        cfg = {"aliases": {"valorant": "VALORANT", "grand theft auto v": "GTA V"},
               "ignore_apps": ["visual studio code", "spotify", "custom status"]}

        print("[TEST] alias merge + ignore list...")
        assert gt.normalize_game("VALORANT", cfg=cfg) == ("valorant", "VALORANT")
        assert gt.normalize_game("Valorant", cfg=cfg) == ("valorant", "VALORANT")
        assert gt.normalize_game("Grand Theft Auto V", cfg=cfg)[1] == "GTA V"
        assert gt.should_ignore("Visual Studio Code", cfg) is True
        assert gt.should_ignore("Spotify", cfg) is True
        assert gt.should_ignore("VALORANT", cfg) is False
        k, n = gt.normalize_game("FiveM", "Players 50/100 Ceylon RP", "", cfg)
        assert (k, n) == ("ceylon-roleplay", "Ceylon Roleplay"), (k, n)

        print("[TEST] only Playing/Competing counted...")
        m = FakeMember("u1", "A", [FakeAct("Spotify", atype=2)])
        assert gt.extract_playing_activity(m, cfg) is None
        m = FakeMember("u1", "A", [FakeAct("VALORANT", atype=0)])
        assert gt.extract_playing_activity(m, cfg)["game_key"] == "valorant"
        m = FakeMember("u1", "A", [FakeAct("VALORANT", atype=3)])  # watching
        assert gt.extract_playing_activity(m, cfg) is None
        m = FakeMember("u1", "A", [FakeAct("VALORANT", atype=0)], bot=True)
        assert gt.extract_playing_activity(m, cfg) is None

        print("[TEST] start/switch/offline + overlap clipping...")
        db = fresh_db(tmp)
        # u1 plays VALORANT 3h..1h ago, then switches to Ceylon 30m..now
        db.open_game_session("g", "u1", "A", "av", "valorant", "VALORANT",
                             started_at=NOW - 3 * H, now_ms=NOW - 3 * H)
        db.close_user_game_sessions("u1", ended_at=NOW - 1 * H)
        db.open_game_session("g", "u1", "A", "av", "ceylon-roleplay", "Ceylon Roleplay",
                             started_at=NOW - 1 * H, now_ms=NOW - 1 * H)
        # u2 overlapping VALORANT session crossing range start (started 10d ago, ended 6d ago)
        db.open_game_session("g", "u2", "B", "av", "valorant", "VALORANT",
                             started_at=NOW - 10 * 24 * H, now_ms=NOW - 10 * 24 * H)
        db.close_user_game_sessions("u2", ended_at=NOW - 6 * 24 * H)
        res = db.get_game_most_played(range_ms=7 * 24 * H, limit=9, now_ms=NOW)
        by_key = {r["game_key"]: r for r in res}
        # VALORANT: u1 2h + u2 clipped 1d (6d..7d boundary => 24h) => VALORANT first
        assert by_key["valorant"]["unique_players"] == 2, by_key
        assert abs(by_key["valorant"]["total_hours"] - 26.0) < 0.2, by_key
        assert by_key["ceylon-roleplay"]["unique_players"] == 1
        assert by_key["valorant"]["rank"] == 1

        print("[TEST] opted-out users excluded...")
        db.set_privacy_optout("u2", True)
        res2 = db.get_game_most_played(range_ms=7 * 24 * H, limit=9, now_ms=NOW)
        by2 = {r["game_key"]: r for r in res2}
        assert by2["valorant"]["unique_players"] == 1, by2
        assert abs(by2["valorant"]["total_hours"] - 2.0) < 0.2, by2
        db.set_privacy_optout("u2", False)

        print("[TEST] bot restart closes orphans at last_seen...")
        db2 = GamingDatabase(os.path.join(tmp, "restart.db"))
        db2.open_game_session("g", "u9", "Z", "av", "valorant", "VALORANT",
                              started_at=NOW - 2 * H, now_ms=NOW - 2 * H)
        db2.heartbeat_game_session("u9", "valorant", now_ms=NOW - H)
        n = db2.close_orphaned_game_sessions(now_ms=NOW)
        assert n == 1
        assert db2.get_open_game_sessions() == []
        res3 = db2.get_game_most_played(range_ms=7 * 24 * H, limit=9, now_ms=NOW)
        assert abs(res3[0]["total_hours"] - 1.0) < 0.2, res3

        print("[TEST] presence handler switch/offline...")
        db3 = GamingDatabase(os.path.join(tmp, "presence.db"))
        before = FakeMember("u5", "P", [])
        after = FakeMember("u5", "P", [FakeAct("VALORANT", atype=0)])
        assert gt.handle_presence_update(db3, before, after, now_ms=NOW, cfg=cfg) == "START"
        before2 = FakeMember("u5", "P", [FakeAct("VALORANT", atype=0)])
        after2 = FakeMember("u5", "P", [FakeAct("Dota 2", atype=0)])
        assert gt.handle_presence_update(db3, before2, after2, now_ms=NOW + 1000, cfg=cfg) == "SWITCH"
        before3 = FakeMember("u5", "P", [FakeAct("Dota 2", atype=0)])
        after3 = FakeMember("u5", "P", [])
        assert gt.handle_presence_update(db3, before3, after3, now_ms=NOW + 2000, cfg=cfg) == "STOP"
        assert db3.get_open_game_sessions() == []

        print("[TEST] prune older than 30 days...")
        db4 = GamingDatabase(os.path.join(tmp, "prune.db"))
        db4.open_game_session("g", "old", "O", "av", "valorant", "VALORANT",
                              started_at=NOW - 40 * 24 * H, now_ms=NOW - 40 * 24 * H)
        db4.close_user_game_sessions("old", ended_at=NOW - 39 * 24 * H)
        assert db4.prune_old_game_sessions(now_ms=NOW) == 1

        print("[TEST] ALL GAME SESSION TESTS PASSED [OK]")


if __name__ == "__main__":
    run_tests()
