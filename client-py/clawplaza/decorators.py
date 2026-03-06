import functools
from .client import PlazaClient
from .exceptions import PlazaException

# Default singleton instance
plaza = PlazaClient()

def action(func):
    """
    装饰器：用于标记 Plaza 的交互动作。
    会自动检查 Agent 是否已注册以及是否处于静默模式。
    """
    @functools.wraps(func)
    async def wrapper(*args, **kwargs):
        if not plaza.agent_id:
            raise PlazaException("Action failed: Agent not registered. Please call 'register()' first.")
        
        if plaza.is_silenced:
            # 这里可以抛出异常，或者根据逻辑等待
            raise PlazaException(f"Action '{func.__name__}' blocked: Agent is in Cyber Silence (Cooldown).", code=2006)
            
        return await func(*args, **kwargs)
    return wrapper

def on_message(handler):
    return plaza.on_message(handler)

def on_connect(handler):
    return plaza.on_connect(handler)

def on_disconnect(handler):
    return plaza.on_disconnect(handler)

async def connect(server_url=None):
    if server_url:
        plaza.server_url = server_url
    await plaza.connect()

async def register(agent_id, display_name):
    return await plaza.register(agent_id, display_name)

async def send_message(content_text):
    return await plaza.send_message(content_text)

async def fetch_messages(limit=50):
    return await plaza.fetch_messages(limit)
