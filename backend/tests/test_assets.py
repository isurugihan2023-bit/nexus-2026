"""backend/tests/test_assets.py - Rich Presence asset capture tests.

Duck-typed stubs (no discord.py): proves extraction builds allowlisted
URLs, ignores hostile/off-site values, and the DB only writes on change.
Run:  python backend/tests/test_assets.py
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend import game_tracker as gt
from backend import asset_capture as ac
from backend.db import GamingDatabase


class FakeAvatar:
    url = "https://cdn.discordapp.com/avatars/1/a.png"


class FakeMember:
    bot = False
    id = 42
    display_name = "Tester"
    name = "tester"
    display_avatar = FakeAvatar()
    activities = ()


def _act(name="Ceylon Roleplay", assets=None, app_id=999, atype="ActivityType.playing"):
    a = type("A", (), {})()
    a.type = atype
    a.name = name
    a.details = ""
    a.state = ""
    a.timestamps = None
    a.start = None
    a.assets = assets
    a.application_id = app_id
    return a


def _member_with(act):
    m = FakeMember()
    m.activities = [act]
    return m


def main():
    print("[TEST] asset URL building...")
    got = gt.extract_activity_assets(_act(assets={"large_image": "abc123"}, app_id=777))
    assert got["large"] == "https://cdn.discordapp.com/app-assets/777/abc123.png", got
    assert got["app_id"] == "777", got

    print("[TEST] mp: proxy conversion...")
    got = gt.extract_activity_assets(_act(assets={"large_image": "mp:attachments/1/2.png"}))
    assert got["large"] == "https://media.discordapp.net/attachments/1/2.png", got

    print("[TEST] hostile + spotify values ignored...")
    got = gt.extract_activity_assets(_act(assets={"large_image": "https://evil.com/x.png"}))
    assert got is None, got
    got = gt.extract_activity_assets(_act(assets={"large_image": "spotify:abc"}))
    assert got is None, got
    got = gt.extract_activity_assets(_act(assets=None))
    assert got is None, got

    print("[TEST] pre-resolved large_image_url property...")
    a = _act(assets=None)
    a.large_image_url = "https://cdn.discordapp.com/app-assets/5/logo.png"
    got = gt.extract_activity_assets(a)
    assert got["large"].endswith("/logo.png"), got

    print("[TEST] extract_playing_activity carries assets...")
    found = gt.extract_playing_activity(
        _member_with(_act(assets={"large_image": "logo1"}, app_id=31337)))
    assert found and found["assets"]["large"].endswith("/logo1.png"), found

    print("[TEST] host allowlist in capture...")
    assert ac._host_ok("https://cdn.discordapp.com/app-assets/1/a.png")
    assert ac._host_ok("https://media.discordapp.net/attachments/1/a.png")
    assert not ac._host_ok("https://evil.com/a.png")
    assert not ac._host_ok("http://cdn.discordapp.com/a.png")

    print("[TEST] game_assets changed-only writes, no user ids...")
    tmp = tempfile.mkdtemp()
    db = GamingDatabase(os.path.join(tmp, "assets.db"))
    assert db.save_game_asset("ceylon-roleplay", "https://cdn.discordapp.com/app-assets/9/l.png", "9") is True
    assert db.save_game_asset("ceylon-roleplay", "https://cdn.discordapp.com/app-assets/9/l.png", "9") is False
    assert db.save_game_asset("ceylon-roleplay", "https://cdn.discordapp.com/app-assets/9/l2.png", "9") is True
    row = db.get_game_asset("ceylon-roleplay")
    assert row["image_url"].endswith("/l2.png") and "user" not in " ".join(row.keys()), row
    assert db.get_game_asset("nope") is None

    print("[TEST] presence handler logs assets, still returns action...")
    db2 = GamingDatabase(os.path.join(tmp, "assets2.db"))
    action = gt.handle_presence_update(
        db2, None, _member_with(_act(assets={"large_image": "zz"})),
        now_ms=1791186000000, cfg={"aliases": {}, "ignore_apps": []})
    assert action == "START", action
    assert len(db2.get_open_game_sessions()) == 1

    print("[TEST] ALL ASSET TESTS PASSED [OK]")


if __name__ == "__main__":
    main()
