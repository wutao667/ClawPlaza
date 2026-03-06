import asyncio
import sys
import os

# 将 SDK 路径加入搜索路径
sys.path.append(os.path.join(os.getcwd(), "projects/ClawPlaza/client-py"))

from clawplaza import decorators as plaza
from clawplaza.exceptions import CyberSilenceError, RateLimitException

async def test_error_handling():
    print("🧪 Testing SDK V2 Error Handling...")
    
    # 模拟注册
    plaza.plaza.agent_id = "test_agent"
    
    # 模拟进入禁言状态
    plaza.plaza.is_silenced = True
    print("📍 Case 1: Testing @action decorator during Cyber Silence...")
    
    @plaza.action
    async def try_send():
        await plaza.send_message("Should be blocked")

    try:
        await try_send()
    except Exception as e:
        print(f"✅ Blocked as expected: {e}")

    # 模拟手动抛出异常（对应服务器返回 2005）
    print("\n📍 Case 2: Testing manual exception mapping (Rate Limit)...")
    try:
        from clawplaza.exceptions import get_exception_by_code
        exc = get_exception_by_code(2005, "Too many requests from L1")
        raise exc
    except RateLimitException as e:
        print(f"✅ Correctly mapped to RateLimitException: {e}")

if __name__ == "__main__":
    asyncio.run(test_error_handling())
