"""
backend/game_tracker.py - Authoritative Discord presence -> game session tracking.

Duck-typed (no discord.py import) so unit tests can use plain stubs.
Only activities of type Playing (and optionally Competing) become sessions.
Bots, Spotify/Listening, Custom Status, Watching, and the configurable
ignore list never create sessions.

Config: backend/config/games.json (alias map + ignore list).
DB: GamingDatabase.game_sessions additive table (see db.py).
All timestamps are UTC epoch MILLISECONDS.
"""

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("nexus.games")

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "games.json")

_DEFAULT_ALIASES: Dict[str, str] = {}
_DEFAULT_IGNORE: List[str] = []


def _slug(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"


def load_tracker_config(path: Optional[str] = None) -> Dict[str, Any]:
    cfg_path = path or os.getenv("NEXUS_GAMES_CONFIG", CONFIG_PATH)
    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"aliases": {}, "ignore_apps": []}


def _config_aliases(cfg: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
    if cfg is None:
        cfg = load_tracker_config()
    raw = (cfg.get("aliases") or {})
    return {str(k).lower().strip(): str(v).strip() for k, v in raw.items()}


def _config_ignore(cfg: Optional[Dict[str, Any]] = None) -> List[str]:
    if cfg is None:
        cfg = load_tracker_config()
    return [str(x).lower().strip() for x in (cfg.get("ignore_apps") or []) if str(x).strip()]


def normalize_game(name: str, details: str = "", state: str = "",
                   cfg: Optional[Dict[str, Any]] = None) -> Tuple[str, str]:
    """Return (game_key, game_name). Special-cases FiveM/Ceylon Roleplay."""
    raw_name = (name or "").strip()
    lower_all = f"{raw_name} {details or ''} {state or ''}".lower()
    # FiveM special-case: Ceylon Roleplay server identity in details/state.
    if "ceylon" in lower_all:
        return ("ceylon-roleplay", "Ceylon Roleplay")
    lname = raw_name.lower().strip()
    aliases = _config_aliases(cfg)
    if lname in aliases:
        canon = aliases[lname]
        return (_slug(canon), canon)
    for frag, canon in aliases.items():
        if frag and frag in lname:
            return (_slug(canon), canon)
    canon = raw_name or "Unknown"
    return (_slug(canon), canon)


def _activity_type_name(act: Any) -> str:
    t = getattr(act, "type", None)
    # discord.py: ActivityType.playing == 0, competing == 5; allow str names too.
    try:
        v = int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
    except Exception:
        v = None
    if v == 0:
        return "playing"
    if v == 5:
        return "competing"
    name = str(t).lower() if t is not None else ""
    # ActivityType.playing str() looks like "ActivityType.playing"
    if "competing" in name:
        return "competing"
    if "playing" in name:
        return "playing"
    return name


def should_ignore(name: str, cfg: Optional[Dict[str, Any]] = None) -> bool:
    lname = (name or "").lower().strip()
    if not lname or lname in ("custom status", "customstatus", "spotify"):
        return True
    for frag in _config_ignore(cfg):
        if frag and frag in lname:
            return True
    return False


def extract_playing_activity(member: Any, cfg: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    """Best Playing/Competing game activity for a member, or None."""
    if member is None or bool(getattr(member, "bot", False)):
        return None
    activities = getattr(member, "activities", None) or []
    for act in activities:
        tname = _activity_type_name(act)
        if tname not in ("playing", "competing"):
            continue
        name = (getattr(act, "name", None) or "").strip()
        if not name or should_ignore(name, cfg):
            continue
        details = (getattr(act, "details", None) or "") or ""
        state = (getattr(act, "state", None) or "") or ""
        game_key, game_name = normalize_game(name, details, state, cfg)
        start_ms: Optional[int] = None
        try:
            ts = getattr(act, "timestamps", None)
            if isinstance(ts, dict) and ts.get("start"):
                v = float(ts["start"])
                start_ms = int(v * 1000) if v < 1e12 else int(v)
            elif getattr(act, "start", None) is not None:
                start_ms = int(act.start.timestamp() * 1000)  # type: ignore
            elif getattr(ts, "get", None):
                v = ts.get("start")
                if v:
                    v = float(v)
                    start_ms = int(v * 1000) if v < 1e12 else int(v)
        except Exception:
            start_ms = None
        avatar = getattr(member, "display_avatar", None)
        avatar_url = str(getattr(avatar, "url", "") or "https://cdn.discordapp.com/embed/avatars/0.png")
        disp = str(getattr(member, "display_name", None) or getattr(member, "name", "Member"))
        return {
            "game_key": game_key,
            "game_name": game_name,
            "details": str(details)[:140],
            "state": str(state)[:140],
            "start_timestamp": start_ms,
            "username": disp,
            "avatar": avatar_url,
        }
    return None


def diff_presence(before: Any, after: Any, cfg: Optional[Dict[str, Any]] = None) -> Tuple[Optional[Dict], Optional[Dict]]:
    """Return (old_act, new_act) extracted under the same rules."""
    return (extract_playing_activity(before, cfg), extract_playing_activity(after, cfg))


def scan_live_members(guilds: List[Any], cfg: Optional[Dict[str, Any]] = None) -> Dict[str, Dict[str, Any]]:
    """Rebuild the live set from guild.members (used on boot). {user_id: act+ids}."""
    live: Dict[str, Dict[str, Any]] = {}
    for guild in guilds or []:
        gid = str(getattr(guild, "id", ""))
        for member in getattr(guild, "members", []) or []:
            if bool(getattr(member, "bot", False)):
                continue
            act = extract_playing_activity(member, cfg)
            if act:
                uid = str(getattr(member, "id"))
                live[uid] = {**act, "user_id": uid, "guild_id": gid}
    return live


def handle_presence_update(db: Any, before: Any, after: Any,
                           now_ms: Optional[int] = None,
                           cfg: Optional[Dict[str, Any]] = None,
                           guild_id: str = "") -> str:
    """Open/close/heartbeat game_sessions on presence change.

    Returns: START | STOP | SWITCH | HEARTBEAT | UPDATE | IGNORED.
    Invisible/offline members (no activities at all) count as STOP.
    """
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    member = after if after is not None else before
    if member is None or bool(getattr(member, "bot", False)):
        return "IGNORED"
    uid = str(getattr(member, "id"))
    old_act, new_act = diff_presence(before, after, cfg)
    gid = guild_id or str(getattr(getattr(member, "guild", None), "id", "") or "")

    if new_act and (not old_act or old_act["game_key"] != new_act["game_key"]):
        action = "SWITCH" if old_act else "START"
        db.open_game_session(
            guild_id=gid, user_id=uid,
            username=new_act["username"], avatar_url=new_act["avatar"],
            game_key=new_act["game_key"], game_name=new_act["game_name"],
            details=new_act.get("details", ""), state=new_act.get("state", ""),
            started_at=new_act.get("start_timestamp") or now, now_ms=now,
        )
        logger.info("[GAMES] %s %s", action, new_act["game_name"])
        return action
    if old_act and not new_act:
        db.close_user_game_sessions(uid, ended_at=now)
        return "STOP"
    if old_act and new_act:
        db.heartbeat_game_session(uid, new_act["game_key"], now_ms=now,
                                  details=new_act.get("details", ""),
                                  state=new_act.get("state", ""))
        if old_act.get("details") != new_act.get("details"):
            return "UPDATE"
        return "HEARTBEAT"
    return "IGNORED"
