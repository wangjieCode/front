# 前端交互流程说明

## 界面布局

### 主界面结构

```
┌─────────────────────────────────────────────────────────┐
│  侧边栏 (300px)          │  主内容区                    │
│  ┌──────────────────┐    │                              │
│  │  前端小秘 Logo   │    │  ┌────────────────────────┐ │
│  │  [新对话按钮]    │    │  │  有什么可以帮你的？    │ │
│  └──────────────────┘    │  │                        │ │
│                          │  │  [模式选择器]          │ │
│  对话历史列表:           │  │  ┌──────────────────┐ │ │
│  ┌──────────────────┐    │  │  │  输入框          │ │ │
│  │ 📝 修改一下文案  │    │  │  │  (多行文本)      │ │ │
│  │ 📅 2024-01-01    │    │  │  └──────────────────┘ │ │
│  │ 🔵 编辑模式      │    │  │  [发送按钮]          │ │ │
│  └──────────────────┘    │  └────────────────────────┘ │
│  ┌──────────────────┐    │                              │
│  │ 👁️ 看一下页面    │    │  示例提示:                   │
│  │ 📅 2024-01-01    │    │  [修改文案] [看功能] [查接口]│
│  │ ⚪ 只读模式      │    │                              │
│  └──────────────────┘    │                              │
└─────────────────────────────────────────────────────────┘
```

## 核心交互流程

### 1. 创建新对话

**用户操作**:
1. 在主界面输入需求描述
2. 选择对话模式（编辑/只读）
3. 点击"发送"按钮或按 Ctrl+Enter

**前端流程**:
```typescript
// 1. 调用 API 创建对话
const response = await conversationService.createConversation({
  taskId: `task-${Date.now()}`,
  initialPrompt: prompt,
  projectInfo: {
    workDir: '/workspace/dtmall-admin',
    gitBranch: 'master',
  },
  mode: 'edit' | 'readonly',
});

// 2. 切换到对话视图
setCurrentConversation(response.data);
setShowConversation(true);

// 3. 自动发送初始消息
// ConversationView 组件会自动处理
```

**后端响应**:
- 创建会话记录
- 返回会话 ID 和基本信息
- 不自动生成 AI 响应（需要前端主动发送消息）

### 2. 发送消息（SSE 流式）

**用户操作**:
1. 在对话界面输入消息
2. 点击"发送"或按 Ctrl+Enter

**前端流程**:
```typescript
// 1. 立即显示用户消息
const userMessage = {
  id: `temp-${Date.now()}`,
  role: 'user',
  content: content,
  timestamp: new Date().toISOString(),
};
setMessages(prev => [...prev, userMessage]);

// 2. 创建临时 AI 消息（用于流式更新）
const aiMessage = {
  id: `ai-${Date.now()}`,
  role: 'assistant',
  content: '',
  timestamp: new Date().toISOString(),
};
setMessages(prev => [...prev, aiMessage]);

// 3. 发送请求并接收 SSE 流
const response = await fetch('/api/conversations/:sessionId/messages', {
  method: 'POST',
  body: JSON.stringify({ content }),
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

// 4. 逐块接收并更新 AI 消息
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const text = decoder.decode(value);
  // 解析 SSE 事件
  if (data.type === 'chunk') {
    // 追加内容到 AI 消息
    setMessages(prev => 
      prev.map(msg => 
        msg.id === aiMessageId 
          ? { ...msg, content: msg.content + data.content }
          : msg
      )
    );
  }
}

// 5. 完成后重新加载消息（获取完整数据）
await loadMessages();
```

**SSE 事件类型**:
- `user_message`: 用户消息确认
- `chunk`: AI 响应片段（50 字符/次，10ms 延迟）
- `complete`: 响应完成
- `error`: 错误信息

### 3. 查看对话历史

**用户操作**:
1. 点击侧边栏的历史对话

**前端流程**:
```typescript
// 1. 切换到对话视图
setCurrentConversation(conversation);
setShowConversation(true);

// 2. ConversationView 自动加载消息
useEffect(() => {
  loadSession();    // 加载会话信息
  loadMessages();   // 加载消息历史
}, [sessionId]);
```

### 4. 模式切换

**两种模式**:

#### 编辑模式 (Edit Mode)
- 图标: ✏️ EditOutlined
- 颜色: 蓝色 (#1890ff)
- 功能: AI 可以修改代码、创建分支、创建 MR
- 适用: 开发新功能、修复 Bug

#### 只读模式 (Readonly Mode)
- 图标: 👁️ EyeOutlined
- 颜色: 灰色 (#8c8c8c)
- 功能: AI 只能查询代码，不能修改
- 适用: 了解代码、查询 API、分析结构

**切换方式**:
```typescript
<ModeSelector value={mode} onChange={setMode} />
```

## 组件结构

### 核心组件

#### 1. App.tsx
**职责**: 主应用容器
- 管理对话列表
- 切换主界面/对话界面
- 创建新对话

**状态**:
```typescript
- conversations: 对话列表
- currentConversation: 当前对话
- showConversation: 是否显示对话界面
- mode: 对话模式
```

#### 2. ConversationView.tsx
**职责**: 对话视图
- 显示对话历史
- 处理消息发送
- SSE 流式接收

**功能**:
- 自动加载会话和消息
- 自动发送初始消息
- 自动滚动到最新消息
- 实时更新 AI 响应

#### 3. MessageList.tsx
**职责**: 消息列表展示
- Markdown 渲染
- 代码高亮
- 代码变更展示
- 问题选项展示

**特性**:
- 解析 stream-json 格式
- 提取 AI 最终答案
- 支持工具调用信息

#### 4. MessageInput.tsx
**职责**: 消息输入
- 多行文本输入
- Markdown 支持
- 快捷键发送 (Ctrl+Enter)

#### 5. ModeSelector.tsx
**职责**: 模式选择器
- 编辑/只读模式切换
- 模式说明提示

## 数据流

### 创建对话流程

```
用户输入
  ↓
App.handleSubmit()
  ↓
conversationService.createConversation()
  ↓
POST /api/conversations
  ↓
后端创建会话
  ↓
返回会话信息
  ↓
切换到 ConversationView
  ↓
自动发送初始消息
```

### 消息发送流程

```
用户输入消息
  ↓
MessageInput.handleSend()
  ↓
ConversationView.handleSendMessage()
  ↓
立即显示用户消息
  ↓
创建临时 AI 消息
  ↓
POST /api/conversations/:id/messages (SSE)
  ↓
接收 SSE 流
  ├─ user_message: 确认
  ├─ chunk: 逐块更新 AI 消息
  └─ complete: 完成
  ↓
重新加载完整消息
```

### 消息解析流程

```
AI 原始响应 (stream-json)
  ↓
parseAIContent()
  ↓
尝试解析完整 JSON
  ├─ 成功: 提取 assistant.text
  └─ 失败: 按行解析
  ↓
查找最后的 assistant 消息
  ↓
提取 text 字段
  ↓
返回可读文本
  ↓
Markdown 渲染
```

## 用户体验优化

### 1. 打字机效果
- Chunk 大小: 50 字符
- 延迟: 10ms
- 效果: 流畅的实时响应

### 2. 自动滚动
```typescript
useEffect(() => {
  scrollToBottom();
}, [messages]);
```

### 3. 快捷键支持
- `Ctrl+Enter` / `Cmd+Enter`: 发送消息
- 支持多行输入

### 4. 加载状态
- 发送中: 按钮显示 loading
- 禁用输入: 防止重复发送

### 5. 错误处理
- 网络错误: 显示错误提示
- 解析失败: 显示原始内容
- 超时重试: 自动重连

## 样式特点

### 1. 渐变背景
```css
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%)
```

### 2. 玻璃态卡片
```css
.glass-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: 24px;
}
```

### 3. 消息气泡
- 用户消息: 蓝色背景，右对齐
- AI 消息: 白色背景，左对齐
- 系统消息: 灰色背景，左对齐

### 4. 代码高亮
- 使用 `react-syntax-highlighter`
- 主题: `vscDarkPlus`
- 支持多种语言

## API 调用

### 1. 创建对话
```typescript
POST /api/conversations
Body: {
  taskId: string,
  initialPrompt: string,
  projectInfo: { workDir, gitBranch },
  mode: 'edit' | 'readonly'
}
```

### 2. 发送消息
```typescript
POST /api/conversations/:sessionId/messages
Body: { content: string, branchId?: string }
Response: SSE Stream
```

### 3. 获取消息历史
```typescript
GET /api/conversations/:sessionId/messages
Query: { branchId?, since? }
```

### 4. 获取对话列表
```typescript
GET /api/conversations
```

## 状态管理

### App 级别状态
```typescript
- conversations: ConversationSession[]
- currentConversation: ConversationSession | null
- showConversation: boolean
- mode: ConversationMode
```

### ConversationView 状态
```typescript
- session: ConversationSession | null
- messages: ConversationMessage[]
- loading: boolean
- sending: boolean
```

### MessageInput 状态
```typescript
- content: string
- sending: boolean
```

## 性能优化

### 1. 增量加载
- 使用 `since` 参数只获取新消息
- 减少数据传输量

### 2. 虚拟滚动
- 大量消息时使用虚拟列表
- 提高渲染性能

### 3. 防抖节流
- 输入防抖
- 滚动节流

### 4. 缓存策略
- 缓存对话列表
- 缓存消息历史

## 未来优化方向

1. **离线支持**: Service Worker 缓存
2. **消息搜索**: 全文搜索功能
3. **消息编辑**: 编辑已发送的消息
4. **消息删除**: 删除不需要的消息
5. **导出对话**: 导出为 Markdown/PDF
6. **语音输入**: 支持语音转文字
7. **快捷回复**: 常用回复模板
8. **主题切换**: 明暗主题切换
