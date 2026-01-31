# 模型选择规格

## 目标

- 新建对话时可选择 Neovate 使用的模型。
- 未显式选择时默认使用 `iflow/qwen3-coder-plus`。

## 支持模型

1. iflow/glm-4.6（recommend）
2. iflow/deepseek-v3.2
3. iflow/qwen3-coder-plus
4. iflow/kimi-k2-thinking
5. iflow/minimax-m2
6. iflow/kimi-k2-0905

## 前端交互

- 入口：新建对话页（landing）
- 表单项：模型选择（下拉）
- 默认值：`iflow/qwen3-coder-plus`
- 创建对话时随请求参数传给后端

## 后端行为

- 创建对话时校验 `model` 是否在支持列表中
- 未传 `model` 时使用默认值
- AI 执行时将 `model` 透传给 Neovate CLI 的 `--model`

## API

- `POST /api/conversations`
  - 新增字段：`model?: string`
  - 默认值：`iflow/qwen3-coder-plus`
- `POST /api/conversations/:sessionId/messages`
  - 新增字段：`model?: string`（仅影响本次执行；非法值将被忽略）
