# WebSocket 实时更新问题排查

## 问题描述

任务执行完成后，前端页面状态没有实时更新。

## 可能的原因

1. **前端页面未打开**：任务执行时前端页面没有打开，无法接收 WebSocket 消息
2. **WebSocket 未连接**：前端 WebSocket 连接失败或断开
3. **消息处理错误**：前端接收到消息但处理逻辑有问题
4. **缓存问题**：浏览器使用了旧版本的前端代码

## 排查步骤

### 1. 检查 WebSocket 连接状态

打开浏览器开发者工具（F12），查看 Console 标签页：

**正常情况应该看到**：
```
✅ WebSocket 连接成功
```

**如果看到错误**：
```
WebSocket 错误: ...
尝试重连 WebSocket (1/5)，2000ms 后重试...
```

### 2. 检查后端 WebSocket 客户端数量

```bash
curl http://localhost:3001/health | jq '.websocket'
```

**预期输出**：
```json
{
  "clients": 1
}
```

如果 `clients` 为 0，说明前端没有连接到 WebSocket。

### 3. 查看 WebSocket 消息

在浏览器开发者工具的 Console 中，应该能看到：

```
收到 WebSocket 消息: {type: "task:status", payload: {...}}
消息类型: task:status
消息 payload: {taskId: "xxx", status: "running"}
```

### 4. 测试 WebSocket 连接

打开测试页面：
```
http://localhost:3000/test-websocket.html
```

应该看到：
- 状态: 已连接 ✅
- 收到的消息列表

### 5. 创建测试任务

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"测试任务"}'
```

在前端页面的 Console 中应该能看到实时消息。

## 解决方案

### 方案 1：刷新页面

最简单的方法是刷新浏览器页面（Ctrl+R 或 Cmd+R）：

1. 刷新页面会重新加载最新的前端代码
2. 自动重新连接 WebSocket
3. 重新加载任务列表

### 方案 2：清除缓存

如果刷新后仍有问题：

1. 打开开发者工具（F12）
2. 右键点击刷新按钮
3. 选择"清空缓存并硬性重新加载"

### 方案 3：检查网络

确保：
- 后端服务正在运行（http://localhost:3001/health）
- 前端服务正在运行（http://localhost:3000）
- 没有防火墙阻止 WebSocket 连接

### 方案 4：查看详细日志

在浏览器 Console 中查看详细的 WebSocket 消息日志：

```javascript
// 应该看到类似的输出
收到 WebSocket 消息: {type: "task:status", payload: {taskId: "xxx", status: "running"}}
更新任务状态: xxx → running
收到任务完成消息: {taskId: "xxx", mrUrl: "https://..."}
任务完成，更新状态: xxx MR: https://...
```

## 已知问题

### 问题 1：任务执行时页面未打开

**现象**：任务已经完成，但打开页面时状态显示错误

**原因**：WebSocket 消息是实时的，如果页面没有打开，就收不到消息

**解决**：
1. 刷新页面，前端会通过 REST API 重新获取最新状态
2. 或者在创建任务前先打开页面

### 问题 2：WebSocket 自动重连

**现象**：Console 中看到重连消息

**原因**：WebSocket 连接断开（网络问题、后端重启等）

**解决**：等待自动重连（最多 5 次），或刷新页面

### 问题 3：状态不一致

**现象**：任务列表中的状态与任务详情不一致

**原因**：状态更新逻辑可能有 bug

**解决**：刷新页面重新加载所有数据

## 调试技巧

### 1. 启用详细日志

前端代码已经添加了详细的 console.log，打开浏览器 Console 即可查看。

### 2. 监控 WebSocket 流量

在浏览器开发者工具中：
1. 打开 Network 标签页
2. 筛选 WS（WebSocket）
3. 点击 WebSocket 连接
4. 查看 Messages 标签页

可以看到所有收发的 WebSocket 消息。

### 3. 手动测试 API

```bash
# 获取任务状态
curl http://localhost:3001/api/tasks/{taskId}

# 获取任务日志
curl http://localhost:3001/api/tasks/{taskId}/logs
```

## 最佳实践

1. **创建任务前先打开页面**：确保能接收实时更新
2. **保持页面打开**：任务执行期间不要关闭页面
3. **定期刷新**：如果长时间未操作，刷新页面确保状态最新
4. **查看 Console**：遇到问题时先查看浏览器 Console 的日志

## 联系支持

如果以上方法都无法解决问题，请提供：
1. 浏览器 Console 的完整日志
2. 任务 ID
3. 后端日志（如果可以访问）
4. 问题发生的具体步骤
