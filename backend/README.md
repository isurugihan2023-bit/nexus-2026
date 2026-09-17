# Ninja Nexus — Real-Time Live Gaming Platform (Backend Deployment Guide)

This directory contains the drop-in Python modules and deployment configurations for the Ninja Nexus Discord bot daemon hosted at `157.90.181.183:23063`.

---

## Architecture Overview

```
[Discord Gateway] ── presenceUpdate ──> [nexus-bot (Python 3.12 + aiohttp)]
                                                │
                                    ┌───────────┴───────────┐
                                    ▼                       ▼
                           [live_ws.py]                [db.py]
                           • /ws/live-games            • SQLite Sessions
                           • Delta Broadcast           • Leaderboards
                                    │                       │
                                    ▼                       ▼
                             [Caddy TLS Proxy]        [stats_api.py]
                             wss://<subdomain>        /api/stats/*
```

---

## 1. Phase 0: TLS Termination (Required for `wss://`)

Because the web frontend is served over HTTPS on Vercel, browsers require WebSocket connections to use `wss://`.

1. Install Caddy on Ubuntu/Debian:
   ```bash
   sudo apt update
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update
   sudo apt install caddy
   ```
2. Copy `backend/Caddyfile` to `/etc/caddy/Caddyfile`.
3. Update the domain (e.g. `api.ninjanexus.duckdns.org` or `nexus-api.duckdns.org`) to point to your VPS IP `157.90.181.183`.
4. Restart Caddy:
   ```bash
   sudo systemctl restart caddy
   ```
   *Caddy automatically issues and renews free Let's Encrypt SSL certificates.*

---

## 2. Phase 1 & 2: Bot Integration

Copy the `backend/` files into your bot's working directory on the VPS:

1. **`live_ws.py`**:
   Mounts the WebSocket endpoint at `/ws/live-games`.
   Call `ws_manager.broadcast_delta(...)` inside your `on_presence_update(before, after)` event handler.
2. **`db.py`**:
   Initializes SQLite database `nexus_gaming.db`.
   Records session starts/stops and aggregates playtime statistics.
3. **`stats_api.py`**:
   Mounts additive REST routes onto your existing aiohttp `web.Application`:
   - `GET /api/stats/most-played?period=week`
   - `GET /api/stats/leaderboard?period=week`
   - `GET /api/stats/user/{discord_id}`
   - `GET /api/games/{name}`
4. **`rawg.py`**:
   Automated metadata resolver. Fetches official cover art and genres from RAWG and Steam CDN, caching them in SQLite. Set `RAWG_API_KEY` in environment if available.
5. Reference implementation:
   See [backend/bot_integration_example.py](file:///d:/repo/2026%20web/nexus-2026/backend/bot_integration_example.py) for a complete sample showing how all hooks plug together.

---

## 3. Phase 4: Reliability & Supervision

1. Copy `backend/systemd/nexus-bot.service` to `/etc/systemd/system/nexus-bot.service`:
   ```bash
   sudo cp backend/systemd/nexus-bot.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable nexus-bot
   sudo systemctl restart nexus-bot
   ```
2. Logging:
   Structured JSON logs are automatically rotated in `logs/nexus_gaming.log` (10MB per file, 5 archives).
3. Automated Healthcheck:
   The GitHub Actions workflow at `.github/workflows/healthcheck.yml` automatically tests `/api/public_stats` every 5 minutes and alerts a configured Discord webhook on failure.

---

## 4. Frontend Fallback Guarantee

If the WebSocket is unreachable, the client browser immediately and silently falls back to the existing 4-second REST polling loop (`usingFallbackPolling = true`) through `/api/bot_data`. There is zero downtime or degraded user experience during rollout.
