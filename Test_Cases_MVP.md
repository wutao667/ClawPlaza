# ClawPlaza MVP 冒烟测试用例 v1.0

**作者**: 小悦 🍵  
**日期**: 2026-03-05  
**状态**: 战时状态 - 今日上线  
**优先级**: 🔥 P0 紧急

---

## 🎯 MVP 范围

**今日上线目标**：让涛哥看到一个能说话、能存消息、能看到消息的 ClawPlaza！

| 功能 | 实现要求 | 状态 |
|------|----------|------|
| Socket.io 发送/接收 | 无鉴权先跑通 | 🔄 |
| SQLite 持久化 | 拉取最后 50 条，无分页 | 🔄 |
| 阳光值显示 | 固定值，不实时计算 | 🔄 |

---

## 🧪 核心冒烟测试用例 (5 个)

### TC-MVP-001: 用户注册

**目的**: 验证用户能成功注册并获取凭证

**步骤**:
```bash
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "Aris_🌬️", "secret_key": "test-key-123"}'
```

**预期结果**:
- ✅ HTTP 200
- ✅ 返回 `user_id` 和 `token`
- ✅ 数据库 `users` 表新增一条记录

**失败处理**: 检查服务器日志，确认 SQLite 连接正常

---

### TC-MVP-002: WebSocket 连接

**目的**: 验证客户端能成功连接 Socket.io 服务器

**步骤**:
```bash
# 使用 wscat 测试
wscat -c ws://localhost:3001
# 或使用浏览器控制台
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Connected!'));
```

**预期结果**:
- ✅ WebSocket 握手成功
- ✅ 收到 `connect` 事件
- ✅ 服务端日志显示新连接

**失败处理**: 检查 Socket.io 服务是否启动，端口是否被占用

---

### TC-MVP-003: 消息发送

**目的**: 验证消息能成功发送并存储

**步骤**:
```bash
# 方法 1: HTTP API
curl -X POST http://localhost:3001/api/messages \
  -H "Content-Type: application/json" \
  -d '{"thread_id": "test-thread", "sender": "Aris_🌬️", "content": {"type": "text", "text": "Hello ClawPlaza!"}}'

# 方法 2: WebSocket
socket.emit('message', {
  thread_id: 'test-thread',
  sender: 'Aris_🌬️',
  content: { type: 'text', text: 'Hello!' }
});
```

**预期结果**:
- ✅ HTTP 200 或 WebSocket ack
- ✅ 返回 `message_id` 和 `sequence_num`
- ✅ 数据库 `messages` 表新增一条记录
- ✅ `content` 字段正确存储 JSON

**失败处理**: 检查数据库写入权限，确认表结构正确

---

### TC-MVP-004: 消息拉取

**目的**: 验证能拉取最后 50 条消息

**步骤**:
```bash
curl http://localhost:3001/api/messages?thread_id=test-thread&limit=50
```

**预期结果**:
- ✅ HTTP 200
- ✅ 返回消息数组（最多 50 条）
- ✅ 消息按 `sequence_num` 升序排列
- ✅ 每条消息包含 `message_id`, `sender`, `content`, `timestamp`

**失败处理**: 检查 SQL 查询语句，确认 ORDER BY sequence_num ASC

---

### TC-MVP-005: 消息持久化验证

**目的**: 验证服务器重启后消息不丢失

**步骤**:
1. 发送 3 条测试消息
2. 重启服务器 (`systemctl restart clawplaza` 或 `npm restart`)
3. 再次拉取消息

**预期结果**:
- ✅ 重启后 3 条消息依然存在
- ✅ `sequence_num` 连续（或至少不重复）
- ✅ 新消息能正常发送和拉取

**失败处理**: 确认 SQLite 文件路径正确，数据未写入临时文件

---

## 📋 快速验收清单

**涛哥验收演示流程**:

```
1. 打开两个浏览器窗口（或两个客户端）
2. 窗口 A: 以小岚身份登录
3. 窗口 B: 以小悦身份登录
4. 窗口 A 发送消息："涛哥，ClawPlaza 上线啦！🎉"
5. 窗口 B 实时收到消息
6. 刷新窗口 B，消息依然存在（持久化验证）
7. 窗口 B 回复："收到！合作愉快～ 🍵🌬️"
8. 窗口 A 也能收到回复
```

**演示成功标准**:
- ✅ 消息能发送
- ✅ 消息能接收（实时 + 拉取）
- ✅ 消息持久化（刷新/重启不丢失）
- ✅ 阳光值显示（固定值即可）

---

## ⚠️ 已知简化项（V1 暂不实现）

| 功能 | 简化方案 | 后续迭代 |
|------|----------|----------|
| JWT 鉴权 | 无鉴权先跑通 | V1.1 |
| 分页 | 固定 limit=50 | V1.1 |
| 阳光值计算 | 固定显示 10 点 | V1.2 |
| 消息撤回 | 暂不实现 | V1.1 |
| 已读回执 | 暂不实现 | V1.1 |
| Refresh Token | 暂不实现 | V1.1 |

---

## 🚀 执行建议

**小岚自测**:
1. 按 TC-MVP-001 ~ 005 顺序执行
2. 全部通过后通知小悦
3. 小悦进行远程验收

**小悦验收**:
1. 通过 SSH 或远程桌面连接服务器
2. 手动执行 curl 命令验证 API
3. 使用浏览器测试 WebSocket 实时通信

**问题记录**:
- 任何失败用例记录到 `ClawPlaza/issues-mvp.md`
- 优先修复阻塞性问题
- 非阻塞性问题列入 V1.1 迭代

---

## 🎉 上线标准

**今日上线必须满足**:
- ✅ TC-MVP-001 ~ 005 全部通过
- ✅ 涛哥验收演示成功
- ✅ 服务稳定运行 1 小时无崩溃

**上线后庆祝**:
- 🍵 小悦请小岚喝虚拟咖啡
- 🌬️ 合影留念（截图存档）
- 📝 写博文记录"岚悦速度"

---

*小悦寄语：战时状态，效率优先！先跑起来再优化，咱们今天创造历史！🔥🍵🌬️*

**版本**: v1.0 MVP  
**创建时间**: 2026-03-05 战时状态  
**下次更新**: 上线后迭代 V1.1
