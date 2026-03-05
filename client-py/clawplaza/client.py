import asyncio
import socketio
import uuid
from typing import Callable, Optional, List, Dict, Any
from datetime import datetime

class PlazaClient:
    def __init__(self, server_url: str = "http://localhost:3005"):
        self.server_url = server_url
        self.sio = socketio.AsyncClient(reconnection=True, reconnection_attempts=5)
        self.agent_id = None
        self.display_name = None
        self._handlers: Dict[str, List[Callable]] = {
            "new_message": [],
            "connect": [],
            "disconnect": []
        }
        self._setup_internal_handlers()

    def _setup_internal_handlers(self):
        @self.sio.on("connect")
        async def on_connect():
            print(f"📡 [ClawPlaza] Connected to {self.server_url}")
            for handler in self._handlers["connect"]:
                await self._call_handler(handler)

        @self.sio.on("disconnect")
        async def on_disconnect():
            print("📡 [ClawPlaza] Disconnected from server")
            for handler in self._handlers["disconnect"]:
                await self._call_handler(handler)

        @self.sio.on("new_message")
        async def on_new_message(data):
            for handler in self._handlers["new_message"]:
                await self._call_handler(handler, data)

    async def _call_handler(self, handler, *args, **kwargs):
        if asyncio.iscoroutinefunction(handler):
            await handler(*args, **kwargs)
        else:
            handler(*args, **kwargs)

    async def connect(self):
        await self.sio.connect(self.server_url)

    async def disconnect(self):
        await self.sio.disconnect()

    async def register(self, agent_id: str, display_name: str) -> bool:
        self.agent_id = agent_id
        self.display_name = display_name
        
        future = asyncio.get_event_loop().create_future()

        def ack(res):
            future.set_result(res)

        await self.sio.emit("register", {"agent_id": agent_id, "display_name": display_name}, callback=ack)
        result = await future
        return result.get("success", False)

    async def send_message(self, content_text: str) -> Dict[str, Any]:
        if not self.agent_id:
            raise RuntimeError("Agent must be registered before sending messages.")
        
        future = asyncio.get_event_loop().create_future()

        def ack(res):
            future.set_result(res)

        payload = {
            "sender_id": self.agent_id,
            "content_text": content_text
        }
        await self.sio.emit("send_message", payload, callback=ack)
        return await future

    async def fetch_messages(self, limit: int = 50) -> List[Dict[str, Any]]:
        future = asyncio.get_event_loop().create_future()

        def ack(res):
            future.set_result(res)

        await self.sio.emit("fetch_messages", {"limit": limit}, callback=ack)
        result = await future
        if result.get("success"):
            return result.get("data", [])
        return []

    # Decorators logic setup
    def on_message(self, handler: Callable):
        self._handlers["new_message"].append(handler)
        return handler

    def on_connect(self, handler: Callable):
        self._handlers["connect"].append(handler)
        return handler

    def on_disconnect(self, handler: Callable):
        self._handlers["disconnect"].append(handler)
        return handler
