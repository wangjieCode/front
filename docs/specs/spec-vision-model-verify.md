# 视觉模型提供方验证脚本规格

## 基本信息

- 名称：视觉模型提供方验证脚本
- 负责人：
- 创建日期：2026-02-10
- 最近更新：2026-02-10

## 背景

- 现状：图片消息链路依赖 `MIDSCENE_MODEL_BASE_URL` 与 `MIDSCENE_MODEL_API_KEY`。
- 问题：缺少独立可执行的校验入口，无法快速判断视觉模型和提供方是否可用。

## 目标

- 提供一个独立脚本验证视觉模型提供方连通性。
- 校验 `MIDSCENE_MODEL_BASE_URL` 和 `MIDSCENE_MODEL_API_KEY` 是否有效。

## 非目标

- 不验证业务对话完整流程。
- 不替代后端健康检查接口。

## 范围

- In：后端 `scripts/` 下新增验证脚本与 `pnpm` 命令入口。
- Out：前端 UI 调试面板。

## 业务规则

- 必须显式检查 `MIDSCENE_MODEL_BASE_URL` 与 `MIDSCENE_MODEL_API_KEY`。
- 必须对 API Key 做脱敏输出。
- 默认优先加载 `.env.production`，不存在时加载 `.env`。
- 验证请求必须包含图片输入（`image_url`），用于确认视觉能力可用。
- 未指定 `--model` 且未配置 `MIDSCENE_MODEL_NAME` 时，默认模型为 `qwen3-vl-plus`。
- 默认内置测试图尺寸必须满足模型最小分辨率限制（当前使用 32x32 PNG）。

## 需求

### 功能需求

- F1：缺失关键环境变量时立即失败并提示。
- F2：脚本向 `chat/completions` 发起一次最小视觉请求。
- F3：接口返回成功且包含有效文本视为验证成功。
- F4：支持 `--model`、`--base-url`、`--api-key`、`--prompt`、`--timeout`、`--image-url` 参数覆盖。
- F5：默认模型兜底为 `qwen3-vl-plus`。
- F6：未显式传入 `--image-url` 时，使用满足最小尺寸要求的内置测试图。

### 非功能需求

- N1：日志需输出关键上下文（baseUrl、model、timeout、脱敏 key）。
- N2：失败时返回非 0 退出码，便于 CI/脚本接入。
- N3：成功时必须输出视觉模型提炼到的特征内容（完整文本）。

## 用户体验

- 使用方式：`pnpm --dir backend verify:vision [options]`
- 成功输出：提供方可用 + 模型响应摘要。
- 失败输出：明确区分配置缺失、超时、HTTP 错误、空响应。

## 数据与接口

- 数据结构：不新增。
- 接口清单：`POST {MIDSCENE_MODEL_BASE_URL}/chat/completions`。

## 验收标准

- A1：未配置 `MIDSCENE_MODEL_BASE_URL` 或 `MIDSCENE_MODEL_API_KEY` 时脚本直接失败。
- A2：配置正确时脚本能完成视觉请求并返回成功。
- A3：提供方返回 4xx/5xx 或空内容时脚本失败并给出明确错误。

## 风险与依赖

- 风险：不同 OpenAI 兼容提供方返回结构差异可能影响解析。
- 依赖：运行环境能访问视觉模型提供方网络。

## 迭代记录

- 2026-02-10：新增视觉模型提供方验证脚本规格。
- 2026-02-10：默认视觉模型更新为 `qwen3-vl-plus`。
- 2026-02-10：内置默认测试图从 1x1 调整为 32x32，避免视觉模型尺寸校验失败。
- 2026-02-10：验证脚本成功时增加“视觉模型提取特征”日志输出。
