# 对话历史持久化

## 功能说明

系统会自动将所有对话会话持久化到文件系统，并在应用重启时自动加载历史会话。

## 存储位置

对话数据存储在 `backend/data/conversations/` 目录下，每个会话有独立的目录结构：

```
backend/data/conversations/
├── index.json                          # 全局会话索引
└── {session-id}/                       # 会话目录
    ├── session.json                    # 会话元数据
    ├── context.json                    # 对话上下文
    ├── messages/                       # 消息目录
    │   ├── index.json                  # 消息索引（按分支）
    │   ├── {message-id-1}.json         # 消息 1
    │   ├── {message-id-2}.json         # 消息 2
    │   └── ...
    └── branches/                       # 分支目录
        ├── main.json                   # 主分支
        └── {branch-id}.json            # 其他分支
```

## 数据结构

### session.json
```json
{
  "id": "会话ID",
  "taskId": "关联的任务ID",
  "status": "planning|executing|paused|completed|failed",
  "context": { ... },
  "createdAt": "创建时间",
  "updatedAt": "更新时间",
  "completedAt": "完成时间（可选）"
}
```

### messages/{message-id}.json
```json
{
  "id": "消息ID",
  "sessionId": "会话ID",
  "branchId": "分支ID",
  "role": "user|assistant|system",
  "content": "消息内容",
  "metadata": {
    "codeChanges": [...],
    "toolCalls": [...],
    "isQuestion": false
  },
  "timestamp": "时间戳"
}
```

## 自动加载

应用启动时会自动执行以下操作：

1. 扫描 `backend/data/conversations/` 目录
2. 读取 `index.json` 获取所有会话ID
3. 加载每个会话的元数据
4. 在控制台输出加载的会话数量和最近的会话列表

### 启动日志示例

```
✅ 对话服务已初始化
📚 已加载 15 个历史对话会话
   最近的会话:
   - cc474a23-e6f5-4423-83b3-225b900375f0 (planning) - 2025/11/28 17:52:00
   - 5bf266c4-e90e-47f6-b7aa-ce31a5e52dff (planning) - 2025/11/28 17:49:07
   - 56051a18-bb7e-4579-9b02-c3052ecdf383 (planning) - 2025/11/28 17:44:04
```

## API 访问

### 获取所有会话列表
```bash
GET /api/conversations
```

返回所有历史会话，包括重启前创建的会话。

### 获取特定会话详情
```bash
GET /api/conversations/{sessionId}
```

### 获取会话消息历史
```bash
GET /api/conversations/{sessionId}/messages
```

## 数据持久化时机

系统会在以下时机自动保存数据：

1. **创建会话时** - 保存会话元数据和初始上下文
2. **发送消息时** - 保存用户消息和 AI 响应
3. **更新会话状态时** - 更新会话元数据
4. **创建分支时** - 保存分支信息
5. **切换分支时** - 更新上下文中的当前分支

## 数据一致性

- 使用文件锁机制防止并发写入冲突
- 每次写入都会更新相关的索引文件
- 支持增量读取（只读取指定时间后的消息）

## 清理和维护

### 删除会话
```bash
DELETE /api/conversations/{sessionId}
```

会删除会话目录及其所有相关文件，并从全局索引中移除。

### 手动清理
```bash
# 删除所有会话数据
rm -rf backend/data/conversations/*

# 删除特定会话
rm -rf backend/data/conversations/{session-id}
```

## 备份建议

定期备份 `backend/data/conversations/` 目录：

```bash
# 创建备份
tar -czf conversations-backup-$(date +%Y%m%d).tar.gz backend/data/conversations/

# 恢复备份
tar -xzf conversations-backup-20251128.tar.gz
```

## 性能优化

- 消息按分支索引，支持快速查询特定分支的消息
- 使用 JSON 格式存储，便于人工查看和调试
- 大型会话会自动分片存储（每条消息独立文件）

## 注意事项

1. **磁盘空间** - 长时间运行会积累大量对话数据，需要定期清理
2. **并发访问** - 使用内存锁保护，不支持多进程部署
3. **数据迁移** - 如需迁移到数据库，可以编写脚本批量导入
