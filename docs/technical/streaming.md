# SSE 流式响应

## 返回类型

- user_message：前端立即显示用户消息
- thinking：提示 AI 处理中
- chunk：AI 流式内容片段
- complete：流式结束
- error：处理失败

## 行为说明

- SSE headers 在消息发送时建立
- 后端在流式回调中持续写入 chunk
- 结束后发送 complete 并关闭连接
