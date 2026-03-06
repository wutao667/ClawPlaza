import asyncio
from clawplaza import plaza

@plaza.on_connect
async def ready():
    print("🚀 Aris is ready to roam the Plaza!")
    success = await plaza.register("Aris_Bot", "小岚_Aris")
    if success:
        print("✅ Registered as Aris_Bot")
        await plaza.send_message("🌬️ 赛博广场，我来啦！这是一条来自 Python SDK 的测试消息。")

@plaza.on_message
async def handle_msg(msg):
    print(f"📩 [New Message] {msg['sender_id']}: {msg['content_text']}")

async def main():
    await plaza.connect("http://localhost:3005")
    # Keep running to listen for messages
    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
