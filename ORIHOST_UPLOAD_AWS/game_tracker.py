"""
game_tracker.py (FLAT AWS layout: /home/container) - Authoritative Discord
presence -> game session tracking.

Duck-typed (no discord.py import) so unit tests can use plain stubs.
Only activities of type Playing (and optionally Competing) become sessions.
Bots, Spotify/Listening, Custom Status, Watching, and the configurable
ignore list never create sessions.

Config: games.json next to this file (alias map + ignore list).
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
FLAT_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "games.json")

_DEFAULT_ALIASES: Dict[str, str] = {}
_DEFAULT_IGNORE: List[str] = []


def _slug(name: str) -> str:
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "unknown"


def load_tracker_config(path: Optional[str] = None) -> Dict[str, Any]:
    if path:
        cfg_path = path
    elif os.getenv("NEXUS_GAMES_CONFIG"):
        cfg_path = os.getenv("NEXUS_GAMES_CONFIG", "")
    elif os.path.isfile(FLAT_CONFIG_PATH):
        cfg_path = FLAT_CONFIG_PATH  # flat AWS layout: games.json in root
    else:
        cfg_path = CONFIG_PATH
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


def _frag_match(lname: str, frag: str) -> bool:
    """Word-boundary fragment match (never a mid-word false positive).

    Plain `frag in lname` misfires on short aliases: "cod" matches "code"
    (VS Code wrongly became Call of Duty / Tactical FPS) and even the real
    game "Code Vein". Word boundaries keep "CoD" -> Call of Duty working
    while "Code" / "Code Vein" fall through to their own (unknown) entries.
    """
    if not frag:
        return False
    try:
        return re.search(r"\b" + re.escape(frag) + r"\b", lname) is not None
    except Exception:
        return frag in lname


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
        if _frag_match(lname, frag):
            return (_slug(canon), canon)
    canon = raw_name or "Unknown"
    return (_slug(canon), canon)


def _activity_type_name(act: Any) -> str:
    t = getattr(act, "type", None)
    # discord.py: ActivityType.playing == 0, listening == 2, competing == 5;
    # allow str names too.
    try:
        v = int(t) if isinstance(t, int) or (isinstance(t, str) and t.isdigit()) else None
    except Exception:
        v = None
    if v == 0:
        return "playing"
    if v == 2:
        return "listening"
    if v == 5:
        return "competing"
    name = str(t).lower() if t is not None else ""
    # ActivityType.playing str() looks like "ActivityType.playing"
    if "listening" in name:
        return "listening"
    if "competing" in name:
        return "competing"
    if "playing" in name:
        return "playing"
    return name


def should_ignore(name: str, cfg: Optional[Dict[str, Any]] = None) -> bool:
    """Exact (case-insensitive) ignore match - never a substring.

    Substring matching would wrongly swallow real games: ignoring "code"
    (VS Code) must NOT ignore "Code Vein". Exact equality keeps each entry
    scoped to precisely the app named.
    """
    lname = (name or "").lower().strip()
    if not lname or lname in ("custom status", "customstatus", "spotify"):
        return True
    for entry in _config_ignore(cfg):
        if entry and lname == entry:
            return True
    return False


# Discord CDN / media proxy hosts ONLY. Anything else is ignored, so a
# rogue activity can never make the bot fetch (or the site display) an
# off-site image.
ASSET_HOSTS = ("cdn.discordapp.com", "media.discordapp.net")


def _asset_direct_url(app_id: Any, asset: Any) -> Optional[str]:
    """Resolve one raw activity asset value to an allowlisted https URL."""
    raw = str(asset or "").strip()
    if not raw or raw.startswith("spotify:"):
        return None
    if raw.startswith("mp:"):
        # Media-proxy attachment path, e.g. mp:attachments/123/abc.png
        return "https://media.discordapp.net/" + raw[3:].lstrip("/")
    low = raw.lower()
    if low.startswith("https://"):
        host = low.split("://", 1)[1].split("/", 1)[0].split(":", 1)[0]
        return raw if host in ASSET_HOSTS else None
    if low.startswith("http://"):
        return None  # plain http is never accepted, even on CDN hosts
    # Bare asset name/hash: addressable only with the application id.
    try:
        aid = str(getattr(app_id, "id", app_id) or "").strip()
    except Exception:
        aid = ""
    if not aid or not re.fullmatch(r"[A-Za-z0-9_-]+", raw):
        return None
    return f"https://cdn.discordapp.com/app-assets/{aid}/{raw}.png"


def extract_activity_assets(act: Any) -> Optional[Dict[str, Any]]:
    """Best-effort Rich Presence artwork for one activity.

    Returns {"large": url|None, "small": url|None, "large_text": str,
    "app_id": str}, or None when the activity carries no usable art.
    Duck-typed (no discord.py import): reads Activity.assets dicts as
    well as pre-resolved large_image_url / small_image_url properties.
    """
    if act is None:
        return None
    app_id = getattr(act, "application_id", None)
    try:
        app_str = str(getattr(app_id, "id", app_id) or "").strip()
    except Exception:
        app_str = ""
    large = small = None
    large_text = ""
    assets = getattr(act, "assets", None)
    if isinstance(assets, dict):
        large = _asset_direct_url(app_id, assets.get("large_image"))
        small = _asset_direct_url(app_id, assets.get("small_image"))
        large_text = str(assets.get("large_text") or "")[:80]
    if not large:
        direct = _asset_direct_url(app_id, getattr(act, "large_image_url", None))
        if direct:
            large = direct
    if not small:
        direct = _asset_direct_url(app_id, getattr(act, "small_image_url", None))
        if direct:
            small = direct
    if not (large or small):
        return None
    return {"large": large, "small": small, "large_text": large_text,
            "app_id": app_str}


def _log_activity_assets(new_act: Dict[str, Any]) -> None:
    """TEMPORARY discovery log for the asset survey (remove afterwards).

    Shows which games actually ship Rich Presence artwork. Read with:
    journalctl / bot logs | grep ASSETS-TEMP
    """
    a = new_act.get("assets") or {}
    logger.info("[ASSETS-TEMP] game=%s key=%s large=%s small=%s app=%s",
                new_act.get("game_name"), new_act.get("game_key"),
                a.get("large") or "-", a.get("small") or "-",
                a.get("app_id") or "-")


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
            "assets": extract_activity_assets(act),
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
    if new_act:
        _log_activity_assets(new_act)
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
