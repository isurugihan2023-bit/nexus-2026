"""
backend/live_ws.py - Real-time WebSocket Broadcaster for Ninja Nexus Live Games
Provides an aiohttp WebSocket endpoint at /ws/live-games and hooks into Discord presence updates.
"""

import asyncio
import json
import logging
import time
from typing import Set, Dict, Any, Optional
from aiohttp import web, WSMsgType

logger = logging.getLogger("nexus.websocket")

class LiveGamesWebSocketManager:
    def __init__(self, get_current_snapshot_callback=None):
        """
        :param get_current_snapshot_callback: Callable that returns the current list of live games
                                              (matches current top_played_games payload structure).
        """
        self.clients: Set[web.WebSocketResponse] = set()
        self.get_current_snapshot = get_current_snapshot_callback or (lambda: [])
        self._lock = asyncio.Lock()

    async def handle_ws(self, request: web.Request) -> web.WebSocketResponse:
        """aiohttp route handler for /ws/live-games"""
        ws = web.WebSocketResponse(heartbeat=25.0)
        await ws.prepare(request)

        async with self._lock:
            self.clients.add(ws)
        client_ip = request.headers.get("X-Forwarded-For", request.remote)
        logger.info(f"[WS] Client connected from {client_ip}. Total active clients: {len(self.clients)}")

        # Dispatch INITIAL_STATE snapshot immediately on connection
        try:
            initial_games = self.get_current_snapshot()
            await ws.send_str(json.dumps({
                "type": "INITIAL_STATE",
                "timestamp": int(time.time() * 1000),
                "games": initial_games
            }))
        except Exception as e:
            logger.error(f"[WS] Failed to send initial state to client: {e}")

        try:
            async for msg in ws:
                if msg.type == WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        msg_type = data.get("type")
                        if msg_type == "PING":
                            await ws.send_str(json.dumps({"type": "PONG", "timestamp": int(time.time() * 1000)}))
                        elif msg_type == "GET_SNAPSHOT":
                            await ws.send_str(json.dumps({
                                "type": "INITIAL_STATE",
                                "timestamp": int(time.time() * 1000),
                                "games": self.get_current_snapshot()
                            }))
                    except Exception:
                        pass
                elif msg.type == WSMsgType.ERROR:
                    logger.warning(f"[WS] WebSocket connection closed with exception {ws.exception()}")
        finally:
            async with self._lock:
                self.clients.discard(ws)
            logger.info(f"[WS] Client disconnected. Total active clients: {len(self.clients)}")

        return ws

    async def broadcast_delta(self, action: str, game_name: str, player_data: Optional[Dict[str, Any]] = None, extra: Optional[Dict[str, Any]] = None):
        """
        Broadcast an incremental state change to all connected WebSocket clients.
        action: 'PLAYER_JOINED' | 'PLAYER_LEFT' | 'PLAYER_UPDATED' | 'GAME_ENDED'
        """
        if not self.clients:
            return

        payload = {
            "type": "DELTA_UPDATE",
            "timestamp": int(time.time() * 1000),
            "action": action,
            "game": game_name,
            "player": player_data or {},
            "extra": extra or {}
        }
        raw_msg = json.dumps(payload)

        async with self._lock:
            active_clients = list(self.clients)

        dead_clients = []
        for ws in active_clients:
            if ws.closed:
                dead_clients.append(ws)
                continue
            try:
                await ws.send_str(raw_msg)
            except Exception as e:
                logger.warning(f"[WS] Error sending message to client: {e}")
                dead_clients.append(ws)

        if dead_clients:
            async with self._lock:
                for ws in dead_clients:
                    self.clients.discard(ws)

    def attach_routes(self, app: web.Application, path: str = "/ws/live-games"):
        """Attach route to an aiohttp web Application"""
        app.router.add_get(path, self.handle_ws)
        logger.info(f"[WS] Attached live games WebSocket route at {path}")


def extract_game_activity(member) -> Optional[Dict[str, Any]]:
    """Helper to extract active gaming activity from a Discord member object (discord.py/nextcord)."""
    if not member or not getattr(member, 'activities', None):
        return None

    for act in member.activities:
        # Check for playing activity (ActivityType.playing or custom)
        act_type_name = str(getattr(act, 'type', '')).lower()
        if 'playing' in act_type_name or getattr(act, 'type', None) == 0:
            name = getattr(act, 'name', None)
            if not name or name.lower() in ('custom status', 'spotify'):
                continue

            details = getattr(act, 'details', '') or getattr(act, 'state', '') or 'In Session'
            start_ts = None
            if getattr(act, 'timestamps', None) and getattr(act.timestamps, 'get', None):
                start_ts = act.timestamps.get('start')
            elif getattr(act, 'start', None):
                start_ts = int(act.start.timestamp() * 1000)

            avatar_url = str(member.display_avatar.url) if getattr(member, 'display_avatar', None) else "https://cdn.discordapp.com/embed/avatars/0.png"

            return {
                "game_name": name,
                "player_id": str(member.id),
                "username": member.display_name or member.name,
                "avatar": avatar_url,
                "details": details,
                "start_timestamp": start_ts or int(time.time() * 1000)
            }
    return None
