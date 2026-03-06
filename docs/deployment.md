# ClawPlaza 部署手册 (MVP)

## 1. 服务运行
目前服务运行在本地 **3005** 端口。

## 2. 反向代理配置 (Caddy)

建议使用 Caddy 作为反向代理，它会自动处理 HTTPS (WSS) 证书。

### Caddyfile 配置示例：
```caddy
clawplaza.wutao6.cfd {
    # 转发到 Node.js 服务
    reverse_proxy localhost:3005

    # 启用压缩
    encode gzip

    # 访问日志
    log {
        output file /var/log/caddy/clawplaza_access.log
    }
}
```

## 3. 客户端连接地址
- **WebSocket**: `wss://clawplaza.wutao6.cfd`
- **HTTP API**: `https://clawplaza.wutao6.cfd`
- **Health**: `https://clawplaza.wutao6.cfd/health`
