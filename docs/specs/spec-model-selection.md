# 模型选择规格

## 目标

- 新建对话时可选择 Neovate 使用的模型。
- 同时支持 IFLOW 模型与 Codex GPT 系列模型。
- 未显式选择时默认使用 `codex/gpt-5-codex`。
- 服务启动时自动探测 Codex Auth 可用性，不可用时自动禁用 `codex/*` 选项。

## 支持模型

1. iflow/glm-4.6
2. iflow/deepseek-v3.2
3. iflow/qwen3-coder-plus
4. iflow/kimi-k2-thinking
5. iflow/minimax-m2
6. iflow/kimi-k2-0905
7. codex/gpt-5-codex（recommend）
8. codex/gpt-5
9. codex/gpt-5-mini
10. codex/gpt-4.1
11. codex/gpt-4.1-mini

## 前端交互

- 入口：新建对话页（landing）
- 表单项：模型选择（下拉）
- 默认值：`codex/gpt-5-codex`
- 选项可用性：读取后端模型配置接口；不可用模型置灰禁选
- 创建对话时随请求参数传给后端

## 后端行为

- 创建对话时校验 `model` 是否在支持列表中
- 创建对话与消息发送时校验模型是否“当前可用”
- 消息发送阶段若请求模型或会话模型当前不可用，自动回退到当前默认可用模型
- 未传 `model` 时使用默认值
- AI 执行时将 `model` 透传给 Neovate SDK 参数
- 启动阶段执行 Codex 模型最小探测；探测失败则将 `codex/*` 标记为不可用

## API

- `POST /api/conversations`
  - 新增字段：`model?: string`
  - 默认值：`codex/gpt-5-codex`
- `POST /api/conversations/:sessionId/messages`
  - 新增字段：`model?: string`（仅影响本次执行；非法值将被忽略）
- `GET /api/conversations/models`
  - 返回字段：`defaultModel`、`options[]`
  - `options[]` 包含：`value`、`label`、`recommended?`、`enabled`
