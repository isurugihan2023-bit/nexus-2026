"""
backend/voice_tracker.py - Authoritative voice-session tracking for Ninja Nexus.

Drop-in logic for the VPS bot (dashboard.py / voice_live endpoint). It is
deliberately duck-typed: it reads only attributes (member.id, member.bot,
member.voice.channel/self_mute/self_deaf/mute/deaf, channel.id/name/members)
so it works with discord.py objects AND with plain stubs in unit tests.
No import of discord here, so this module has zero extra dependencies.

Contract with the dashboard (unchanged shape, additive fields only):
    {"count": <int>, "members": [{
        "user_id", "display_name", "handle", "avatar_url",
        "channel_name", "channel_id",
        "since": <UTC epoch ms when THIS voice visit started>,
        "elapsed_seconds": <SERVER-computed, clamped 0..86400>,
        "self_mute", "self_deaf", "mute", "deaf": <real voice flags>,
        "is_bot": <bool, BOT label source; bots never accrue ranked time>
    }]}
"""

import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("nexus.voice")

# Display clamp: a single live timer never exceeds 24h. Anything older is a
# stale row (missed leave / offline period) and is reset by reconcile().
MAX_DISPLAY_ELAPSED_SECONDS = 24 * 3600


def _now_ms(now_ms: Optional[int] = None) -> int:
    return now_ms if now_ms is not None else int(time.time() * 1000)


def _voice_of(member: Any) -> Any:
    return getattr(member, "voice", None)


def _channel_of(voice_state: Any) -> Any:
    return getattr(voice_state, "channel", None) if voice_state is not None else None


def _is_bot(member: Any) -> bool:
    return bool(getattr(member, "bot", False))


def _display_name(member: Any) -> str:
    return str(getattr(member, "display_name", None) or getattr(member, "name", "Member"))


def _handle(member: Any) -> str:
    return str(getattr(member, "name", _display_name(member)))


def _avatar_url(member: Any) -> str:
    avatar = getattr(member, "display_avatar", None)
    url = getattr(avatar, "url", None) if avatar is not None else None
    return str(url or "https://cdn.discordapp.com/embed/avatars/0.png")


def _mute_flags(member: Any) -> Dict[str, bool]:
    """Real voice flags straight from the member's live VoiceState.

    self_mute/self_deaf = user pressed the button; mute/deaf = server-side
    action by a moderator. These must be passed through, never hard-coded.
    """
    vs = _voice_of(member)
    return {
        "self_mute": bool(getattr(vs, "self_mute", False)),
        "self_deaf": bool(getattr(vs, "self_deaf", False)),
        "mute": bool(getattr(vs, "mute", False)),
        "deaf": bool(getattr(vs, "deaf", False)),
    }


def present_voice_members(guilds: List[Any], include_bots: bool = False) -> Dict[str, Dict[str, Any]]:
    """REAL current voice occupancy: guild voice channels -> members.

    Returns {str(user_id): {member, channel_id, channel_name, ...}}.
    This is the truth reconcile() diffs stored opens against.
    """
    present: Dict[str, Dict[str, Any]] = {}
    for guild in guilds or []:
        for channel in getattr(guild, "voice_channels", []) or []:
            for member in getattr(channel, "members", []) or []:
                if _is_bot(member) and not include_bots:
                    continue
                uid = str(getattr(member, "id"))
                present[uid] = {
                    "member": member,
                    "channel_id": str(getattr(channel, "id", "")),
                    "channel_name": str(getattr(channel, "name", "")),
                }
    return present


def sane_elapsed_seconds(since_ms: int, now_ms: int) -> int:
    """Clamp a live timer: negative (clock skew / future start) -> 0,
    absurd (>24h) -> 24h cap. Never show a timer the bot cannot vouch for."""
    elapsed = (now_ms - since_ms) // 1000
    if elapsed < 0:
        return 0
    return min(elapsed, MAX_DISPLAY_ELAPSED_SECONDS)


def reconcile_voice_sessions(db: Any, guilds: List[Any], now_ms: Optional[int] = None) -> Dict[str, Any]:
    """on_ready / reconnect / resume: make stored opens match reality.

    - Closes every open session for members NOT currently in voice
      (ended_at = now; history rows are kept, only unclosed rows change).
    - Restarts sessions for members who ARE in voice but whose stored
      start predates this reconcile (after a restart the bot cannot verify
      the pre-restart portion, so the old row is closed at now and a fresh
      row starts at now — totals keep the old time, live timers stay honest).
    - Opens sessions for members in voice with no open row at all.
    - Bots never get rows (their time is never ranked).
    """
    now = _now_ms(now_ms)
    present = present_voice_members(guilds, include_bots=False)
    opens = {str(r["discord_user_id"]): r for r in db.get_open_voice_sessions()}

    closed_stale: List[Dict[str, Any]] = []
    restarted: List[Dict[str, Any]] = []
    opened_fresh: List[Dict[str, Any]] = []

    for uid, row in opens.items():
        if uid not in present:
            db.close_voice_session(uid, ended_at=now)
            closed_stale.append({
                "discord_user_id": uid,
                "username": row.get("username"),
                "was_open_ms": max(0, now - row.get("started_at", now)),
            })
            logger.info("[VOICE] Reconcile closed stale session for %s", row.get("username"))

    for uid, info in present.items():
        member = info["member"]
        row = opens.get(uid)
        if row is None or uid in [c["discord_user_id"] for c in closed_stale]:
            db.open_voice_session(uid, _display_name(member), info["channel_id"],
                                  info["channel_name"], started_at=now, is_bot=False)
            opened_fresh.append({"discord_user_id": uid, "username": _display_name(member)})
        elif row.get("started_at", now) < now:
            # Stored start is unverifiable after a restart/reconnect: bank it
            # into history and restart the live timer at this moment.
            db.close_voice_session(uid, ended_at=now)
            db.open_voice_session(uid, _display_name(member), info["channel_id"],
                                  info["channel_name"], started_at=now, is_bot=False)
            restarted.append({"discord_user_id": uid, "username": _display_name(member)})

    return {"closed_stale": closed_stale, "restarted": restarted, "opened_fresh": opened_fresh}


def handle_voice_state_update(db: Any, member: Any, before: Any, after: Any,
                              now_ms: Optional[int] = None) -> str:
    """on_voice_state_update: join / leave / move / AFK / moderator disconnect.

    - join (None -> channel): open row.
    - leave (channel -> None, incl. moderator disconnect): close row.
    - move (channel A -> channel B, incl. AFK moves): close old row and open
      a new one so per-channel history stays accurate (consistent rule).
    - mute/deafen toggles only (same channel): no row change; flags are read
      live at payload time.
    - bots: ignored (never accrue ranked time).
    Returns the action taken: JOIN | LEAVE | MOVE | UPDATE | IGNORED_BOT.
    """
    now = _now_ms(now_ms)
    if _is_bot(member):
        return "IGNORED_BOT"
    before_ch = _channel_of(before)
    after_ch = _channel_of(after)
    before_id = str(getattr(before_ch, "id", "")) if before_ch is not None else None
    after_id = str(getattr(after_ch, "id", "")) if after_ch is not None else None
    uid = str(getattr(member, "id"))

    if before_ch is None and after_ch is not None:
        db.open_voice_session(uid, _display_name(member), after_id,
                              str(getattr(after_ch, "name", "")), started_at=now)
        logger.info("[VOICE] %s joined %s", _display_name(member), getattr(after_ch, "name", ""))
        return "JOIN"
    if before_ch is not None and after_ch is None:
        db.close_voice_session(uid, ended_at=now)
        logger.info("[VOICE] %s left %s", _display_name(member), getattr(before_ch, "name", ""))
        return "LEAVE"
    if before_ch is not None and after_ch is not None and before_id != after_id:
        db.close_voice_session(uid, ended_at=now)
        db.open_voice_session(uid, _display_name(member), after_id,
                              str(getattr(after_ch, "name", "")), started_at=now)
        logger.info("[VOICE] %s moved %s -> %s", _display_name(member),
                    getattr(before_ch, "name", ""), getattr(after_ch, "name", ""))
        return "MOVE"
    return "UPDATE"


def build_voice_live_payload(db: Any, guilds: List[Any], now_ms: Optional[int] = None,
                             include_bots: bool = False) -> Dict[str, Any]:
    """Build the /api/voice_live body from REAL occupancy + stored sessions.

    Timers are SERVER-computed (elapsed_seconds); the dashboard must tick from
    that value and must not compare a server timestamp against the browser
    clock. Members present without an open row (missed event) are healed by
    opening a row at now. Stale rows for absent members can never leak in:
    only actually-present members are emitted.
    """
    now = _now_ms(now_ms)
    present = present_voice_members(guilds, include_bots=include_bots)
    opens = {str(r["discord_user_id"]): r for r in db.get_open_voice_sessions()}

    members: List[Dict[str, Any]] = []
    for uid, info in present.items():
        member = info["member"]
        bot = _is_bot(member)
        row = opens.get(uid)
        if row is None and not bot:
            # Self-heal a missed join event: start the visit now (honest).
            db.open_voice_session(uid, _display_name(member), info["channel_id"],
                                  info["channel_name"], started_at=now, is_bot=False)
            since = now
        elif row is None:
            since = now  # bots: no stored time, timer reads 00:00:00 + BOT label
        else:
            since = row.get("started_at", now)
        members.append({
            "user_id": uid,
            "display_name": _display_name(member),
            "handle": _handle(member),
            "avatar_url": _avatar_url(member),
            "channel_name": info["channel_name"],
            "channel_id": info["channel_id"],
            "since": since,
            "elapsed_seconds": sane_elapsed_seconds(since, now),
            **_mute_flags(member),
            "is_bot": bot,
        })

    members.sort(key=lambda m: (m["channel_name"], m["display_name"]))
    return {"count": len(members), "members": members, "server_time_ms": now}
