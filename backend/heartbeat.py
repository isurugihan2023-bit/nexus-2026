"""backend/heartbeat.py - Auto-discovery heartbeat sender (bot side).

The bot runs on Bot-Hosting.net (Pterodactyl panel) as plain HTTP with
512 MiB RAM, so this module is STDLIB ONLY (urllib + hmac + threading)
and stays lightweight: one daemon thread, ~one small POST per 30s.

How it works:
  * Every HEARTBEAT_INTERVAL seconds (default 30s) POST to
    <WEBSITE_URL>/api/bot-heartbeat with:
      { baseUrl, ip, port, version, startedAt, timestamp, nonce }
    (and status="online", or "shutting-down" on SIGTERM).
  * WEBSITE_URL: where the website lives, e.g. https://ninjanexus.duckdns.org
  * Address resolution order:
      1. BOT_PUBLIC_URL (full override, e.g. http://157.90.181.183:23063)
      2. BOT_PUBLIC_IP + (SERVER_PORT | BOT_PORT | PORT)  -- SERVER_PORT is
         what Pterodactyl exposes to the container.
      3. Auto-detected public IP + (SERVER_PORT | BOT_PORT | PORT).
    Auto-detect hits https://api.ipify.org with a 3s timeout and caches
    the result for ~10 minutes so we stay light.
  * Each request is signed with HMAC-SHA256 over the canonical string
    "<timestamp>.<nonce>.<baseUrl>" using HEARTBEAT_SECRET. The hex
    digest goes in the x-bot-signature header.
  * Retry with backoff on failure (5s, 10s, 20s, max 60s). NEVER raises
    into the bot: all errors are logged and swallowed.
  * Sends an immediate heartbeat on start() and a best-effort
    "shutting-down" heartbeat on SIGTERM/SIGINT (or stop()).

Wiring (3 lines in your real bot file, see bot_integration_example.py):
    from backend.heartbeat import start_heartbeat
    start_heartbeat()  # reads env, spawns daemon thread

Required env on the bot host:
    HEARTBEAT_SECRET=...   (shared with website, never commit)
    WEBSITE_URL=https://<website-domain>  (heartbeat receiver)
Optional:
    BOT_PUBLIC_URL=http://IP:PORT  (full override, preferred on Pterodactyl)
    BOT_PUBLIC_IP=1.2.3.4          (if you know the IP statically)
    SERVER_PORT=23063              (set by Pterodactyl; BOT_PORT/PORT fallback)
    BOT_VERSION=1.0.0
    HEARTBEAT_INTERVAL=30
"""

import hashlib
import hmac
import json
import logging
import os
import signal
import threading
import time
import urllib.request

log = logging.getLogger("nexus.heartbeat")

HEARTBEAT_INTERVAL_DEFAULT = 30.0
# Short timeouts so a dead website never hangs the bot loop.
HTTP_TIMEOUT = 5.0
IP_DETECT_TIMEOUT = 3.0
# Auto-detected public IP is cached this long (keeps us light on 512 MiB).
IP_CACHE_SECONDS = 600.0

_thread = None
_stop_event = threading.Event()
_started_at_ms = int(time.time() * 1000)
_cached_ip = {"value": "", "at": 0.0}


def _env(name, default=""):
    return (os.getenv(name, default) or default).strip()


def _port():
    """Port resolution: SERVER_PORT (Pterodactyl) > BOT_PORT > PORT > 23063."""
    for name in ("SERVER_PORT", "BOT_PORT", "PORT"):
        raw = _env(name)
        if raw.isdigit() and 1 <= int(raw) <= 65535:
            return int(raw)
    return 23063


def _detect_public_ip():
    """Best-effort public-IP detect, cached for IP_CACHE_SECONDS."""
    now = time.time()
    if _cached_ip["value"] and now - _cached_ip["at"] < IP_CACHE_SECONDS:
        return _cached_ip["value"]
    for url in ("https://api.ipify.org", "https://ifconfig.me/ip"):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Nexus-Heartbeat/1.0"})
            with urllib.request.urlopen(req, timeout=IP_DETECT_TIMEOUT) as resp:
                ip = resp.read().decode("utf-8", errors="ignore").strip()
                # Basic sanity: dotted quad, no port/path.
                parts = ip.split(".")
                if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
                    _cached_ip["value"] = ip
                    _cached_ip["at"] = now
                    return ip
        except Exception:
            continue
    return _cached_ip["value"]  # may be "" on first boot without network


def resolve_base_url():
    """Return (baseUrl, ip, port) following the documented override order."""
    override = _env("BOT_PUBLIC_URL")
    if override:
        base = override.rstrip("/")
        # Best-effort split for the ip/port fields (informational only;
        # the website trusts baseUrl as the dial address).
        ip, port = "", _port()
        try:
            host = base.split("://", 1)[1].split("/", 1)[0]
            if ":" in host:
                ip, port = host.rsplit(":", 1)
                port = int(port)
            else:
                ip = host
        except Exception:
            pass
        return base, ip, port
    ip = _env("BOT_PUBLIC_IP") or _detect_public_ip() or "127.0.0.1"
    port = _port()
    return "http://%s:%d" % (ip, port), ip, port


def _nonce():
    # secrets.token_hex is stdlib; fall back to time+pid mix if unavailable.
    try:
        import secrets

        return secrets.token_hex(8)
    except Exception:
        return "%x%x" % (int(time.time() * 1000), os.getpid())


def sign_payload(secret, timestamp_ms, nonce, base_url):
    """HMAC-SHA256 over '<timestamp>.<nonce>.<baseUrl>' (hex digest)."""
    msg = "%s.%s.%s" % (timestamp_ms, nonce, base_url)
    return hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).hexdigest()


def build_payload(status="online"):
    base_url, ip, port = resolve_base_url()
    now_ms = int(time.time() * 1000)
    return {
        "baseUrl": base_url,
        "ip": ip,
        "port": port,
        "version": _env("BOT_VERSION", "1.0.0"),
        "startedAt": _started_at_ms,
        "timestamp": now_ms,
        "nonce": _nonce(),
        "status": status,
    }


def send_once(status="online"):
    """Send one heartbeat. Returns True on 2xx. Never raises."""
    secret = _env("HEARTBEAT_SECRET")
    website = _env("WEBSITE_URL").rstrip("/")
    if not secret:
        log.warning("[heartbeat] HEARTBEAT_SECRET not set; skipping (bot still runs).")
        return False
    if not website:
        log.warning("[heartbeat] WEBSITE_URL not set; skipping (bot still runs).")
        return False
    payload = build_payload(status=status)
    body = json.dumps(payload).encode("utf-8")
    sig = sign_payload(secret, payload["timestamp"], payload["nonce"], payload["baseUrl"])
    url = website + "/api/bot-heartbeat"
    try:
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Nexus-Heartbeat/1.0",
                "x-bot-signature": sig,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            ok = 200 <= resp.status < 300
            if not ok:
                log.warning("[heartbeat] receiver HTTP %s", resp.status)
            return ok
    except Exception as e:
        log.warning("[heartbeat] send failed: %s: %s", type(e).__name__, e)
        return False


def _loop(interval):
    # Immediate heartbeat on startup so a moved bot is learned in seconds.
    send_once("online")
    backoff = 5.0
    while not _stop_event.wait(interval):
        if send_once("online"):
            backoff = 5.0
        else:
            # Retry with backoff without drifting the normal schedule:
            # one extra retry now, then resume the regular interval.
            time.sleep(min(backoff, 60.0))
            if _stop_event.is_set():
                break
            if send_once("online"):
                backoff = 5.0
            else:
                backoff = min(backoff * 2, 60.0)


def _graceful_shutdown(signum, frame):
    try:
        send_once("shutting-down")
    except Exception:
        pass


def start_heartbeat(interval=None):
    """Start the daemon thread. Idempotent. Never raises."""
    global _thread
    if _thread is not None and _thread.is_alive():
        return _thread
    try:
        iv = float(interval or _env("HEARTBEAT_INTERVAL") or HEARTBEAT_INTERVAL_DEFAULT)
    except Exception:
        iv = HEARTBEAT_INTERVAL_DEFAULT
    iv = max(10.0, min(120.0, iv))
    _stop_event.clear()
    # Graceful SIGTERM/SIGINT: best-effort "shutting-down" heartbeat.
    try:
        signal.signal(signal.SIGTERM, _graceful_shutdown)
    except Exception:
        pass
    try:
        signal.signal(signal.SIGINT, _graceful_shutdown)
    except Exception:
        pass
    _thread = threading.Thread(target=_loop, args=(iv,), name="nexus-heartbeat", daemon=True)
    _thread.start()
    log.info("[heartbeat] started (interval=%ss)", iv)
    return _thread


def stop_heartbeat():
    """Stop the thread + best-effort shutting-down heartbeat. Never raises."""
    try:
        _stop_event.set()
        send_once("shutting-down")
    except Exception:
        pass
