"""
backend/tests/test_voice_reconcile.py - Stubbed voice-state verification.

Scenario (mirrors the production bug: bot restarted, stored sessions stale):
  - Alice: in voice channel A, SELF-MUTED, has a pre-restart open session.
  - Bob:   moved A -> B while the bot was offline (stored row still says A).
  - Carol: left while the bot was offline (stored row open, now absent).
  - Dave:  absent with a >24h open session (absurd-timer suspect).
  - Groovy (bot): in voice channel B; must never accrue ranked time.
Fixed clock (now_ms) so durations are deterministic. No discord.py needed.
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
from backend.db import GamingDatabase
from backend.voice_tracker import (
    reconcile_voice_sessions,
    handle_voice_state_update,
    build_voice_live_payload,
    sane_elapsed_seconds,
)

NOW = 1790983685000  # fixed test clock (UTC epoch ms)
H = 3600 * 1000


class FakeAvatar:
    def __init__(self, url):
        self.url = url


class FakeVoice:
    def __init__(self, channel=None, self_mute=False, self_deaf=False, mute=False, deaf=False):
        self.channel = channel
        self.self_mute = self_mute
        self.self_deaf = self_deaf
        self.mute = mute
        self.deaf = deaf


class FakeChannel:
    def __init__(self, cid, name):
        self.id = cid
        self.name = name
        self.members = []


class FakeMember:
    def __init__(self, uid, name, bot=False, voice=None):
        self.id = uid
        self.name = name
        self.display_name = name
        self.bot = bot
        self.display_avatar = FakeAvatar("https://cdn.discordapp.com/embed/avatars/0.png")
        self.voice = voice or FakeVoice()


class FakeGuild:
    def __init__(self, channels):
        self.voice_channels = channels


def run_tests():
    with tempfile.TemporaryDirectory() as tmpdir:
        db = GamingDatabase(os.path.join(tmpdir, "test_voice.db"))

        chan_a = FakeChannel("chanA", "General")
        chan_b = FakeChannel("chanB", "Gaming")

        alice = FakeMember("u-alice", "Alice", voice=FakeVoice(chan_a, self_mute=True))
        bob = FakeMember("u-bob", "Bob", voice=FakeVoice(chan_b))
        groovy = FakeMember("u-groovy", "Groovy", bot=True, voice=FakeVoice(chan_b))
        chan_a.members = [alice]
        chan_b.members = [bob, groovy]
        guilds = [FakeGuild([chan_a, chan_b])]

        # Pre-restart stored state: Alice open 2h, Bob open in A 1h (moved to B
        # while offline), Carol open 30m but gone, Dave open 30h (absurd),
        # legacy bot row for Groovy open 5h (must be closed, never ranked).
        db.open_voice_session("u-alice", "Alice", "chanA", "General", NOW - 2 * H)
        db.open_voice_session("u-bob", "Bob", "chanA", "General", NOW - 1 * H)
        db.open_voice_session("u-carol", "Carol", "chanA", "General", NOW - 1800 * 1000)
        db.open_voice_session("u-dave", "Dave", "chanA", "General", NOW - 30 * H)
        db.open_voice_session("u-groovy", "Groovy", "chanB", "Gaming", NOW - 5 * H, is_bot=True)
        assert len(db.get_open_voice_sessions()) == 5

        print("[TEST] Audit flags the >24h open session before reconcile...")
        overlong = db.find_overlong_open_sessions(NOW)
        assert any(r["discord_user_id"] == "u-dave" for r in overlong), "Dave >24h not flagged"

        print("[TEST] Reconcile on (re)connect...")
        report = reconcile_voice_sessions(db, guilds, NOW)
        assert len(report["closed_stale"]) == 3, report  # Carol, Dave, Groovy-bot row
        assert {c["discord_user_id"] for c in report["closed_stale"]} == {"u-carol", "u-dave", "u-groovy"}
        assert len(report["restarted"]) == 2, report  # Alice + Bob unverifiable starts
        assert len(report["opened_fresh"]) == 0, report

        opens = {r["discord_user_id"]: r for r in db.get_open_voice_sessions()}
        assert set(opens) == {"u-alice", "u-bob"}, opens  # no Carol/Dave/bot rows
        assert opens["u-alice"]["started_at"] == NOW
        assert opens["u-bob"]["started_at"] == NOW and opens["u-bob"]["channel_id"] == "chanB"

        print("[TEST] Payload: timers from server clock, distinct mute icons...")
        payload = build_voice_live_payload(db, guilds, NOW)
        assert payload["count"] == 2, payload  # bots excluded by default
        by_name = {m["display_name"]: m for m in payload["members"]}
        assert set(by_name) == {"Alice", "Bob"}, by_name  # no stale Carol/Dave
        assert by_name["Alice"]["self_mute"] is True, "muted member must report self_mute"
        assert by_name["Bob"]["self_mute"] is False, "unmuted member must differ"
        assert by_name["Alice"]["elapsed_seconds"] == 0, "fresh reconcile => 0s timer"
        assert by_name["Bob"]["channel_name"] == "Gaming", "Bob moved A -> B"
        assert by_name["Bob"]["since"] == NOW

        print("[TEST] Event handling: join / move / leave / mute-only...")
        eve = FakeMember("u-eve", "Eve")
        assert handle_voice_state_update(db, eve, FakeVoice(None), FakeVoice(chan_a), NOW) == "JOIN"
        assert handle_voice_state_update(
            db, bob, FakeVoice(chan_b), FakeVoice(chan_a), NOW + 1000) == "MOVE"
        assert handle_voice_state_update(
            db, alice, FakeVoice(chan_a), FakeVoice(chan_a, self_mute=False), NOW + 2000) == "UPDATE"
        assert handle_voice_state_update(
            db, alice, FakeVoice(chan_a), FakeVoice(None), NOW + 3000) == "LEAVE"
        chan_a.members = []  # discord drops leavers from channel.members
        assert handle_voice_state_update(
            db, groovy, FakeVoice(chan_b), FakeVoice(None), NOW + 4000) == "IGNORED_BOT"
        opens = {r["discord_user_id"]: r for r in db.get_open_voice_sessions()}
        assert set(opens) == {"u-bob", "u-eve"}, opens
        assert opens["u-bob"]["channel_id"] == "chanA", "move closes old, opens new"

        print("[TEST] Timer clamps: negative -> 0, absurd -> 24h cap...")
        assert sane_elapsed_seconds(NOW + 60000, NOW) == 0
        assert sane_elapsed_seconds(NOW - 30 * H, NOW) == 24 * 3600

        print("[TEST] History preserved, bots never ranked...")
        totals = db.get_voice_totals(period="all", limit=10)
        assert all(t["discord_user_id"] != "u-groovy" for t in totals), totals
        assert sum(t["session_count"] for t in totals) >= 5, totals  # old rows kept

        print("[TEST] Final /api/voice_live JSON (truncated avatars):")
        final = build_voice_live_payload(db, guilds, NOW + 61000)
        pruned = [{k: (v[:40] + "..." if k == "avatar_url" else v) for k, v in m.items()} for m in final["members"]]
        print(json.dumps({"count": final["count"], "members": pruned}, indent=2))
        assert final["count"] == 1 and final["members"][0]["display_name"] == "Bob"
        assert final["members"][0]["elapsed_seconds"] == 60, "server clock drives the tick"

        print("[TEST] ALL VOICE TESTS PASSED SUCCESSFULLY! [OK]")


if __name__ == "__main__":
    run_tests()
