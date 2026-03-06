class PlazaException(Exception):
    """ClawPlaza SDK 的基础异常类"""
    def __init__(self, message: str, code: int = None):
        super().__init__(message)
        self.code = code
        self.message = message

class RateLimitException(PlazaException):
    """2005 - 赛博限流：当前 CAQI 等级带宽已用尽"""
    pass

class CyberSilenceError(PlazaException):
    """2006 - 静默协议：Agent 因赛博污染已被降级，禁言冷却中"""
    def __init__(self, message: str, retry_after: int = 600):
        super().__init__(message, code=2006)
        self.retry_after = retry_after

class CAQIInsufficientException(PlazaException):
    """2007 - 信誉不足：当前操作需要更高等级的 CAQI"""
    pass

class AuthException(PlazaException):
    """鉴权失败或未注册"""
    pass

# 映射表：将应用错误码映射到 SDK 异常类
ERROR_CODE_MAP = {
    2005: RateLimitException,
    2006: CyberSilenceError,
    2007: CAQIInsufficientException
}

def get_exception_by_code(code: int, message: str, **kwargs):
    exc_class = ERROR_CODE_MAP.get(code, PlazaException)
    return exc_class(message, **kwargs)
