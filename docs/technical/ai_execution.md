# AI 执行链路

## 输入

- 用户消息
- 会话上下文（workDir、gitBranch）

## 执行

- Neovate SDK 以 stream-json 输出
- 解析输出并提取 code_changes

## 输出

- AI 消息内容（流式）
- MessageMetadata（codeChanges、toolCalls、gitBranch、mrUrl）

## 自动提交

- 触发条件：变更文件数量 > 0
- 使用 GitService 执行 add/commit/push
