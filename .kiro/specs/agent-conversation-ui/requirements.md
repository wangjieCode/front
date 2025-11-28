# Agent 对话式 UI 需求文档

## 简介

将任务执行界面改造为 Agent 对话式交互，展示 AI 代码助手（neovate）的完整工作流程，包括思考过程、工具调用和执行结果。

## 术语表

- **Agent**: AI 代码助手（如 neovate）
- **Session**: 一次完整的任务执行会话
- **Message**: 对话中的一条消息
- **Tool Use**: Agent 调用工具的行为
- **Tool Result**: 工具执行的返回结果

## 需求

### 需求 1: 解析 neovate 输出流

**用户故事**: 作为系统开发者，我希望能够解析 neovate 的 stream-json 输出，以便提取对话消息和工具调用信息。

#### 验收标准

1. WHEN 系统接收到 neovate 的 stream-json 输出 THEN 系统应能解析每一行 JSON 数据
2. WHEN 解析到 type="system" 的消息 THEN 系统应提取会话初始化信息（sessionId, model, tools）
3. WHEN 解析到 role="assistant" 的消息 THEN 系统应提取 AI 的思考内容和工具调用
4. WHEN 解析到 role="tool" 的消息 THEN 系统应提取工具执行结果
5. WHEN 解析到 type="result" 的消息 THEN 系统应提取最终执行结果

### 需求 2: 对话消息数据模型

**用户故事**: 作为系统开发者，我希望有统一的数据模型来表示对话消息，以便前后端传输和展示。

#### 验收标准

1. WHEN 定义消息类型 THEN 系统应支持 system、assistant、tool、result 四种类型
2. WHEN 定义 assistant 消息 THEN 系统应包含 text 内容和 tool_use 数组
3. WHEN 定义 tool 消息 THEN 系统应包含 toolName、input 和 result
4. WHEN 定义 result 消息 THEN 系统应包含 success 状态和最终内容
5. WHEN 消息包含时间戳 THEN 系统应记录消息的创建时间

### 需求 3: 对话式日志展示组件

**用户故事**: 作为用户，我希望看到 AI 的完整工作流程，包括思考过程和工具调用，以便理解任务是如何完成的。

#### 验收标准

1. WHEN 显示 system 消息 THEN 系统应展示会话初始化信息（模型、可用工具）
2. WHEN 显示 assistant 消息 THEN 系统应展示 AI 的思考文本和即将调用的工具
3. WHEN 显示 tool 消息 THEN 系统应展示工具名称、输入参数和执行结果
4. WHEN 显示 result 消息 THEN 系统应突出显示最终结果
5. WHEN 消息按时间顺序排列 THEN 用户应能看到完整的执行时间线

### 需求 4: 实时流式更新

**用户故事**: 作为用户，我希望实时看到 AI 的工作进度，而不是等待所有内容完成后才显示。

#### 验收标准

1. WHEN neovate 输出新的消息 THEN 前端应立即显示该消息
2. WHEN AI 正在思考 THEN 系统应显示加载动画
3. WHEN 工具正在执行 THEN 系统应显示执行中状态
4. WHEN 消息流结束 THEN 系统应显示完成状态
5. WHEN 发生错误 THEN 系统应在对话流中显示错误信息

### 需求 5: 工具调用可视化

**用户故事**: 作为用户，我希望清楚地看到 AI 调用了哪些工具以及工具的执行结果。

#### 验收标准

1. WHEN AI 调用 read 工具 THEN 系统应显示读取的文件路径和内容预览
2. WHEN AI 调用 grep 工具 THEN 系统应显示搜索模式和匹配结果
3. WHEN AI 调用 write 工具 THEN 系统应显示写入的文件路径
4. WHEN AI 调用 edit 工具 THEN 系统应显示编辑的文件和修改内容
5. WHEN AI 调用 bash 工具 THEN 系统应显示执行的命令和输出

### 需求 6: 消息折叠和展开

**用户故事**: 作为用户，我希望能够折叠和展开详细信息，以便专注于重要内容。

#### 验收标准

1. WHEN 工具结果内容较长 THEN 系统应默认折叠并提供展开按钮
2. WHEN 用户点击展开 THEN 系统应显示完整内容
3. WHEN 用户点击折叠 THEN 系统应隐藏详细内容
4. WHEN 有多个工具调用 THEN 每个工具调用应独立折叠/展开
5. WHEN 最终结果较长 THEN 系统应提供滚动查看功能

### 需求 7: 后端消息解析服务

**用户故事**: 作为系统开发者，我希望后端能够解析 neovate 输出并转换为结构化消息。

#### 验收标准

1. WHEN 后端接收到 neovate 输出流 THEN 系统应逐行解析 JSON
2. WHEN 解析成功 THEN 系统应通过 WebSocket 发送结构化消息给前端
3. WHEN 解析失败 THEN 系统应记录错误并继续处理后续消息
4. WHEN 消息包含嵌套结构 THEN 系统应正确提取所有层级的信息
5. WHEN 会话结束 THEN 系统应发送会话结束标记

### 需求 8: 兼容现有功能

**用户故事**: 作为用户，我希望新的对话式 UI 不影响现有的代码变更展示和日志查看功能。

#### 验收标准

1. WHEN 任务执行完成 THEN 系统应继续显示代码变更列表
2. WHEN 用户切换到代码变更标签 THEN 系统应显示 diff 视图
3. WHEN 用户切换到日志标签 THEN 系统应显示原始日志
4. WHEN 用户切换到对话标签 THEN 系统应显示 Agent 对话流
5. WHEN 任务失败 THEN 系统应在对话流中清晰显示错误原因
