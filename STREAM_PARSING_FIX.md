# 流式响应解析修复

## 问题描述

前端展示了完整的 JSON 流响应，没有正确解析 Neovate AI 的两层 JSON 结构。

## 解决方案

### 两层解析逻辑

1. **第一层解析**：获取 `result` 字段的字符串值（HTTP 响应的外层 JSON）
2. **第二层解析**：将字符串按换行符 `\n` 切割，对每一行进行 `JSON.parse`
3. **消息过滤**：根据 `type` 字段展示不同类型的消息，重点展示 `result` 类型

### 修改的文件

#### 1. `frontend/src/components/TaskExecutionView.tsx`

- 实现了两层 JSON 解析逻辑
- 从流式输出中提取最终的 `result` 消息
- 只展示 `type === 'result'` 的消息内容

#### 2. `frontend/src/components/StreamingLogViewer.tsx`

- 添加了对话消息解析函数 `parseConversationMessage`
- 添加了对话消息渲染函数 `renderConversationMessage`
- 在日志流中识别并美化展示 `result` 类型的消息
- 过滤掉中间过程消息（assistant、tool 等），保持日志简洁

## 消息格式

### 后端发送格式

```json
{
  "result": "{\"type\":\"result\",\"content\":\"执行结果\",\"subtype\":\"success\"}\n{\"type\":\"assistant\",\"text\":\"...\"}\n..."
}
```

### 解析后的消息

```json
{
  "type": "result",
  "subtype": "success",
  "isError": false,
  "content": "执行结果",
  "timestamp": "2025-11-28T10:00:00.000Z",
  "sessionId": "xxx"
}
```

## 展示效果

- ✅ **查询任务**：只展示最终的查询结果，界面简洁
- ✅ **代码修改任务**：展示代码变更和 MR 链接
- ✅ **流式日志**：实时展示重要消息，过滤中间过程
- ✅ **错误处理**：兼容旧格式和解析失败的情况

## 测试建议

1. 创建一个查询类任务（如"查询当前分支"）
2. 创建一个代码修改任务
3. 查看任务执行视图和流式日志
4. 确认只展示核心结果，没有冗余的 JSON 数据
