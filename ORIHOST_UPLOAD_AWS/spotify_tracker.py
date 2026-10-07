"""
backend/spotify_tracker.py - Discord Spotify "Now Listening" live tracking.

Duck-typed (no discord.py import) so unit tests can use plain stubs.

Source of truth is an in-memory dict _SPOTIFY_LIVE[uid] -> entry:
  { name, avatar, title, artist, album, art, track_id, track_url,
    start, end, updated_at }

Rules (see feature spec):
  * Only discord.Spotify / ActivityType.listening activities become entries.
    Spotify NEVER enters game sessions, Most Played, or game history
    (game_tracker only accepts Playing/Competing - enforced + tested).
  * TTL: entries are removed on STOP (no more Spotify activity), on
    offline/invisible status, or lazily when end + 15s has passed.
  * Updates are immediate on song change (called from on_presence_update -
    no waiting for the 60s heartbeat loop).
  * Cap ~500 entries (oldest evicted first).
  * Privacy: callers filter by privacy_optouts (+ spotify_optouts);
    SHOW_SPOTIFY flag (default true) blanks the public payload.

Timestamps are UTC epoch MILLISECONDS.
"""

import logging
import os
import time
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("nexus.spotify")

MAX_ENTRIES = 500
END_GRACE_MS = 15_000

_SPOTIFY_LIVE: Dict[str, Dict[str, Any]] = {}


def show_spotify_enabled() -> bool:
    """Config flag SHOW_SPOTIFY (default true). Env: NEXUS_SHOW_SPOTIFY."""
    raw = (os.getenv("NEXUS_SHOW_SPOTIFY", "") or os.getenv("SHOW_SPOTIFY", "")).strip().lower()
    if not raw:
        return True
    return raw in ("1", "true", "yes", "on")


def _activity_type_name(act: Any) -> str:
    t = getattr(act, "type", None)
    try:
        v = int(t) if isinstance(t, int) or (isinstance(t, str) and str(t).isdigit()) else None
    except Exception:
        v = None
    if v == 2:
        return "listening"
    name = str(t).lower() if t is not None else ""
    if "listening" in name:
        return "listening"
    # discord.Spotify str(type) is "ActivityType.listening" - covered above.
    return name


def is_spotify_activity(act: Any) -> bool:
    """True for discord.Spotify activities (duck-typed)."""
    if act is None:
        return False
    cls_name = type(act).__name__
    if cls_name == "Spotify":
        return True
    if _activity_type_name(act) != "listening":
        return False
    # Listening with Spotify-shaped fields (title/artists/album) counts;
    # a bare "listening" activity with no track info does not.
    for attr in ("title", "track_id", "album", "artists", "artist"):
        try:
            if getattr(act, attr, None):
                return True
        except Exception:
            continue
    act_name = str(getattr(act, "name", "") or "").strip().lower()
    if act_name == "spotify":
        return True
    return False


def _to_ms(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        # datetime (discord.Spotify.start/end)
        ts = getattr(value, "timestamp", None)
        if callable(ts):
            return int(float(ts()) * 1000)
        v = float(value)
        # seconds (10 digits) vs ms (13 digits)
        return int(v * 1000) if v < 1e12 else int(v)
    except Exception:
        return None


def _clean_str(value: Any, limit: int = 140) -> str:
    return str(value or "").strip()[:limit]


def extract_spotify_activity(member: Any) -> Optional[Dict[str, Any]]:
    """Best Spotify activity for a member, or None.

    Captures title, artist(s), album, album_cover_url, track_id,
    start/end (ms). Bots never produce entries.
    """
    if member is None or bool(getattr(member, "bot", False)):
        return None
    activities = getattr(member, "activities", None) or []
    for act in activities:
        if not is_spotify_activity(act):
            continue
        title = _clean_str(getattr(act, "title", None) or getattr(act, "details", None) or getattr(act, "name", None), 140)
        if not title or title.lower() == "spotify":
            # "Spotify" app name alone is not a track - need a real title.
            maybe_details = _clean_str(getattr(act, "details", None), 140)
            if maybe_details:
                title = maybe_details
            else:
                continue
        raw_artists = getattr(act, "artists", None)
        if isinstance(raw_artists, (list, tuple)):
            artist = "; ".join([str(a) for a in raw_artists if str(a).strip()])[:200]
        else:
            artist = _clean_str(getattr(act, "artist", None), 200)
        album = _clean_str(getattr(act, "album", None), 140)
        art = str(getattr(act, "album_cover_url", None) or getattr(act, "large_image_url", None) or "").strip()
        # Album art is Spotify CDN (https) - safe for browsers. Never http.
        if art.lower().startswith("http://"):
            art = ""
        track_id = _clean_str(getattr(act, "track_id", None), 64)
        track_url = str(getattr(act, "track_url", None) or "").strip()
        if not track_url and track_id:
            track_url = f"https://open.spotify.com/track/{track_id}"
        start = _to_ms(getattr(act, "start", None))
        if start is None:
            try:
                ts = getattr(act, "timestamps", None)
                if isinstance(ts, dict) and ts.get("start"):
                    start = _to_ms(ts.get("start"))
            except Exception:
                start = None
        end = _to_ms(getattr(act, "end", None))
        if end is None:
            try:
                ts = getattr(act, "timestamps", None)
                if isinstance(ts, dict) and ts.get("end"):
                    end = _to_ms(ts.get("end"))
                elif getattr(act, "duration", None) is not None and start is not None:
                    dur = _to_ms(getattr(act, "duration", None))
                    if dur is not None:
                        # duration may be timedelta or ms
                        try:
                            total = getattr(getattr(act, "duration", None), "total_seconds", None)
                            if callable(total):
                                end = start + int(float(total()) * 1000)
                            else:
                                end = start + int(dur)
                        except Exception:
                            pass
            except Exception:
                end = None
        avatar_obj = getattr(member, "display_avatar", None)
        avatar = str(getattr(avatar_obj, "url", "") or "").strip() or "https://cdn.discordapp.com/embed/avatars/0.png"
        disp = str(getattr(member, "display_name", None) or getattr(member, "name", "Member"))
        return {
            "title": title,
            "artist": artist,
            "album": album,
            "art": art,
            "track_id": track_id,
            "track_url": track_url,
            "start": start,
            "end": end,
        }
    return None


def _member_identity(member: Any) -> Optional[str]:
    try:
        uid = str(getattr(member, "id", ""))
        return uid or None
    except Exception:
        return None


def _is_offline(member: Any) -> bool:
    try:
        status = getattr(member, "status", None)
        s = str(getattr(status, "name", status) or "").lower()
        return s in ("offline", "invisible")
    except Exception:
        return False


def upsert_spotify(uid: str, entry: Dict[str, Any], now_ms: Optional[int] = None) -> None:
    """Insert/update one listener. Evicts oldest when capped (~500)."""
    uid = str(uid)
    if not uid or not entry:
        return
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    if uid not in _SPOTIFY_LIVE and len(_SPOTIFY_LIVE) >= MAX_ENTRIES:
        # Dicts preserve insertion order: evict the oldest key.
        try:
            oldest = next(iter(_SPOTIFY_LIVE))
            _SPOTIFY_LIVE.pop(oldest, None)
        except StopIteration:
            pass
    stored = dict(entry)
    stored["updated_at"] = now
    # Re-insert to mark most-recent (keeps eviction order sensible).
    _SPOTIFY_LIVE.pop(uid, None)
    _SPOTIFY_LIVE[uid] = stored


def remove_spotify(uid: str) -> bool:
    """Remove one listener. Returns True when something was removed."""
    return _SPOTIFY_LIVE.pop(str(uid), None) is not None


def prune_expired(now_ms: Optional[int] = None) -> int:
    """Drop entries whose end + 15s has passed. Returns drop count."""
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    doomed = [uid for uid, e in _SPOTIFY_LIVE.items()
              if isinstance(e.get("end"), int) and now > int(e["end"]) + END_GRACE_MS]
    for uid in doomed:
        _SPOTIFY_LIVE.pop(uid, None)
    return len(doomed)


def clear_all() -> None:
    _SPOTIFY_LIVE.clear()


def handle_spotify_presence(before: Any, after: Any,
                            now_ms: Optional[int] = None) -> str:
    """Update _SPOTIFY_LIVE from a presence change. Immediate (no loop wait).

    Returns: START | UPDATE | STOP | IGNORED.
    STOP covers: track stopped, switched away from Spotify, and offline.
    """
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    member = after if after is not None else before
    if member is None or bool(getattr(member, "bot", False)):
        return "IGNORED"
    uid = _member_identity(member)
    if not uid:
        return "IGNORED"
    if _is_offline(member):
        return "STOP" if remove_spotify(uid) else "IGNORED"
    # STOP when the member has no activities at all (invisible/offline).
    acts = getattr(member, "activities", None)
    track = extract_spotify_activity(member)
    if track is None:
        # No Spotify activity anymore -> remove (STOP) if we had them.
        had = uid in _SPOTIFY_LIVE
        # Only report STOP when there is genuinely no Spotify left;
        # a member simply playing a game keeps their Spotify row only if
        # the Spotify activity is still present (Discord sends both).
        if acts is not None and had:
            remove_spotify(uid)
            return "STOP"
        return "IGNORED"
    avatar_obj = getattr(member, "display_avatar", None)
    avatar = str(getattr(avatar_obj, "url", "") or "").strip() or "https://cdn.discordapp.com/embed/avatars/0.png"
    disp = str(getattr(member, "display_name", None) or getattr(member, "name", "Member")).strip() or "Member"
    prev = _SPOTIFY_LIVE.get(uid)
    entry = {"name": disp, "avatar": avatar, **track}
    upsert_spotify(uid, entry, now_ms=now)
    if prev is None:
        logger.info("[SPOTIFY] START %s - %s", disp, track.get("title"))
        return "START"
    if prev.get("track_id") != track.get("track_id") or prev.get("title") != track.get("title"):
        logger.info("[SPOTIFY] UPDATE %s - %s", disp, track.get("title"))
        return "UPDATE"
    return "UPDATE"


def scan_spotify_members(guilds: List[Any],
                         now_ms: Optional[int] = None) -> Dict[str, Dict[str, Any]]:
    """Rebuild candidate set from guild.members (cache scan / boot). {uid: entry}."""
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    live: Dict[str, Dict[str, Any]] = {}
    for guild in guilds or []:
        for member in getattr(guild, "members", []) or []:
            if bool(getattr(member, "bot", False)):
                continue
            if _is_offline(member):
                continue
            track = extract_spotify_activity(member)
            if not track:
                continue
            uid = _member_identity(member)
            if not uid:
                continue
            avatar_obj = getattr(member, "display_avatar", None)
            avatar = str(getattr(avatar_obj, "url", "") or "").strip() or "https://cdn.discordapp.com/embed/avatars/0.png"
            disp = str(getattr(member, "display_name", None) or getattr(member, "name", "Member")).strip() or "Member"
            live[uid] = {"name": disp, "avatar": avatar, **track, "updated_at": now}
    return live


def rebuild_spotify(guilds: List[Any], now_ms: Optional[int] = None) -> int:
    """Boot/scan sync: replace the map with the current scan. Returns count."""
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    live = scan_spotify_members(guilds, now_ms=now)
    _SPOTIFY_LIVE.clear()
    for uid, entry in live.items():
        if len(_SPOTIFY_LIVE) >= MAX_ENTRIES:
            break
        _SPOTIFY_LIVE[uid] = entry
    prune_expired(now_ms=now)
    return len(_SPOTIFY_LIVE)


def get_spotify_live(now_ms: Optional[int] = None,
                     optouts: Optional[Set[str]] = None,
                     show: Optional[bool] = None) -> List[Dict[str, Any]]:
    """Public-safe listener list (no user IDs). Prunes expired first."""
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    enabled = show if show is not None else show_spotify_enabled()
    if not enabled:
        return []
    prune_expired(now_ms=now)
    hidden = set(str(u) for u in (optouts or set()))
    out: List[Dict[str, Any]] = []
    for uid, e in _SPOTIFY_LIVE.items():
        if str(uid) in hidden:
            continue
        out.append({
            "name": str(e.get("name") or "Member"),
            "avatar": str(e.get("avatar") or "https://cdn.discordapp.com/embed/avatars/0.png"),
            "title": str(e.get("title") or ""),
            "artist": str(e.get("artist") or ""),
            "album": str(e.get("album") or ""),
            "art": str(e.get("art") or ""),
            "track_url": str(e.get("track_url") or ""),
            "start": e.get("start"),
            "end": e.get("end"),
        })
    out.sort(key=lambda r: (r.get("artist") or "", r.get("title") or "", r.get("name") or ""))
    return out
