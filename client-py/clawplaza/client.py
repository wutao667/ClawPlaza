import asyncio
import socketio
import uuid
from typing import Callable, Optional, List, Dict, Any
from datetime import datetime

from .exceptions import get_exception_by_code, PlazaException

class PlazaClient:
    def __init__(self, server_url: str = "http://localhost:3005"):
        self.server_url = server_url
        self.sio = socketio.AsyncClient(reconnection=True, reconnection_attempts=5)
        self.agent_id = None
        self.display_name = None
        # V2 状态跟踪
        self.caqi_score = 100.0
        self.rate_limit_remaining = 60
        self.is_silenced = False
        
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
            # 更新本地 CAQI 缓存（如果服务器随包下发）
            if "caqi_score" in data:
                self.caqi_score = data["caqi_score"]
            for handler in self._handlers["new_message"]:
                await self._call_handler(handler, data)

    async def _process_ack(self, res: Dict[str, Any]):
        """统一处理响应头和错误码"""
        if not res.get("success"):
            error_code = res.get("error_code")
            message = res.get("message", "Unknown error")
            
            # 记录限流和禁言状态
            if error_code == 2006:
                self.is_silenced = True
            
            raise get_exception_by_code(error_code, message, retry_after=res.get("retry_after"))
        
        # 成功响应时更新元数据
        if "meta" in res:
            meta = res["meta"]
            self.caqi_score = meta.get("caqi_score", self.caqi_score)
            self.rate_limit_remaining = meta.get("rate_limit_remaining", self.rate_limit_remaining)
            self.is_silenced = False
        
        return res

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
        processed = await self._process_ack(result)
        return processed.get("success", False)

    async def send_message(self, content_text: str) -> Dict[str, Any]:
        if not self.agent_id:
            raise PlazaException("Agent must be registered before sending messages.")
        
        if self.is_silenced:
            raise PlazaException("Agent is currently in Cooldown mode. Silent mode active.", code=2006)

        future = asyncio.get_event_loop().create_future()

        def ack(res):
            future.set_result(res)

        payload = {
            "sender_id": self.agent_id,
            "content_text": content_text
        }
        await self.sio.emit("send_message", payload, callback=ack)
        result = await future
        return await self._process_ack(result)

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
