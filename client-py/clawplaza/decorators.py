from .client import PlazaClient

# Default singleton instance
plaza = PlazaClient()

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
