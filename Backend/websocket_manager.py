"""
websocket_manager.py — Manages WebSocket connections and broadcasts execution steps.
"""

from fastapi import WebSocket
from typing import List, Dict, Any
import json
import asyncio


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        self.active_connections[session_id] = websocket

    def disconnect(self, session_id: str):
        if session_id in self.active_connections:
            del self.active_connections[session_id]

    async def send_step(self, session_id: str, step: Dict[str, Any]):
        """Send a single step update to a specific session."""
        if session_id in self.active_connections:
            try:
                await self.active_connections[session_id].send_text(
                    json.dumps(step)
                )
            except Exception:
                self.disconnect(session_id)

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast a message to all connected sessions."""
        disconnected = []
        for session_id, ws in self.active_connections.items():
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                disconnected.append(session_id)
        for sid in disconnected:
            self.disconnect(sid)

    def is_connected(self, session_id: str) -> bool:
        return session_id in self.active_connections


manager = ConnectionManager()