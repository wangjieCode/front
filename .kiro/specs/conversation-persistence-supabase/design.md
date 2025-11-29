# 设计文档

## 概述

本设计将现有的基于文件系统的对话持久化方案迁移到 Supabase PostgreSQL 数据库，提供更强大的数据管理能力、更好的并发性能和更丰富的查询功能。同时优化流式响应机制，在前端实现打字机效果，提升用户体验。

系统将保持现有的接口设计，通过实现新的 `SupabaseConversationStorage` 类来替换 `FileSystemConversationStorage`，确保向后兼容性。

## 架构

### 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                      前端层                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ MessageList  │  │ MessageInput │  │BranchNavigator│  │
│  │ (打字机效果) │  │              │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                 │           │
│         └─────────────────┴─────────────────┘           │
│                           │                             │
│                  ┌────────▼────────┐                    │
│                  │   HTTP/SSE      │                    │
│                  │  (流式响应)     │                    │
│                  └────────┬────────┘                    │
└───────────────────────────┼─────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────┐
│                      后端层│                             │
│  ┌────────────────────────▼──────────────────────────┐  │
│  │           ConversationManager                     │  │
│  │  (会话管理、消息路由、状态控制)                   │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │      IConversationStorage 接口                    │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │    SupabaseConversationStorage                    │  │
│  │  (数据库操作、事务管理、缓存)                     │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                 │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │         Supabase Client                           │  │
│  │  (连接池、查询构建)                               │  │
│  └────────────────────┬──────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Supabase PostgreSQL                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │conversations │  │   messages   │  │   branches   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐                                       │
│  │message_meta  │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

### 数据流

#### 1. 用户发送消息流程
```
用户输入 → MessageInput → HTTP POST → ConversationManager 
→ SupabaseStorage.saveMessage() → PostgreSQL
→ AI 处理 → 流式响应 → SSE 推送 → MessageList (打字机效果)
```

#### 2. 加载历史消息流程
```
前端请求 → HTTP GET → ConversationManager 
→ SupabaseStorage.loadMessages() → PostgreSQL (分页查询)
→ 返回消息列表 → 前端渲染
```

#### 3. 流式响应流程
```
前端建立 SSE 连接 → 后端开始 AI 处理 
→ 生成内容片段 → 通过 SSE 推送 → 前端接收并显示
→ 完成后关闭 SSE 连接
```

## 通信机制

### Server-Sent Events (SSE) 实现

系统使用 SSE 替代 WebSocket 实现流式响应，具有以下优势：

1. **单向通信**：适合服务器推送场景，无需客户端频繁发送数据
2. **自动重连**：浏览器原生支持断线重连
3. **简单实现**：基于 HTTP，无需额外的协议支持
4. **防火墙友好**：使用标准 HTTP 端口，不会被防火墙阻止

#### SSE 端点设计

```typescript
/**
 * SSE 路由
 * GET /api/conversations/:sessionId/messages/:messageId/stream
 */
app.get('/api/conversations/:sessionId/messages/:messageId/stream', async (req, res) => {
  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲

  const { sessionId, messageId } = req.params;
  
  // 注册 SSE 连接
  streamingManager.startStream(sessionId, messageId, res);
  
  // 处理客户端断开
  req.on('close', () => {
    streamingManager.abortStream(messageId);
  });
});
```

#### SSE 消息格式

```
event: chunk
data: {"messageId":"xxx","content":"Hello"}

event: chunk
data: {"messageId":"xxx","content":" World"}

event: complete
data: {"messageId":"xxx","timestamp":1234567890}

event: heartbeat
data: {"timestamp":1234567890}
```

## 技术选型

### ORM 框架：Drizzle ORM

选择 Drizzle ORM 作为数据库 ORM 框架，原因如下：

1. **完全类型安全**：TypeScript 原生支持，自动类型推断
2. **轻量高性能**：零运行时依赖，比 Prisma 更轻量
3. **SQL-like 语法**：接近原生 SQL，易于学习和调试
4. **无外键友好**：完美支持无外键约束的数据库设计
5. **Supabase 官方推荐**：与 Supabase 深度集成
6. **灵活的查询构建**：支持复杂查询和事务

#### 安装依赖

```bash
pnpm add drizzle-orm postgres
pnpm add -D drizzle-kit
```

#### 配置文件 (drizzle.config.ts)

```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

#### 使用示例

```typescript
// 查询示例
const sessions = await db
  .select()
  .from(conversations)
  .where(eq(conversations.status, 'active'))
  .orderBy(desc(conversations.createdAt));

// 插入示例
await db.insert(messages).values({
  conversationId: 'xxx',
  branchId: 'yyy',
  role: 'user',
  content: 'Hello',
});

// 更新示例
await db
  .update(messages)
  .set({ content: 'Updated content', isComplete: true })
  .where(eq(messages.id, messageId));

// 删除示例（应用层级联）
await db.transaction(async (tx) => {
  await tx.delete(messages).where(eq(messages.conversationId, sessionId));
  await tx.delete(branches).where(eq(branches.conversationId, sessionId));
  await tx.delete(conversations).where(eq(conversations.id, sessionId));
});
```

## 组件和接口

### 1. Drizzle 数据库配置

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  connectionString: string;  // PostgreSQL 连接字符串
  max?: number;              // 最大连接数
  idleTimeout?: number;      // 空闲超时（秒）
  connectionTimeout?: number; // 连接超时（秒）
}

/**
 * 数据库客户端管理器
 */
export class DatabaseManager {
  private static client: postgres.Sql | null = null;
  private static db: ReturnType<typeof drizzle> | null = null;

  /**
   * 初始化数据库连接
   */
  static initialize(config: DatabaseConfig): void {
    this.client = postgres(config.connectionString, {
      max: config.max ?? 10,
      idle_timeout: config.idleTimeout ?? 20,
      connect_timeout: config.connectionTimeout ?? 10,
    });
    this.db = drizzle(this.client);
  }

  /**
   * 获取 Drizzle 数据库实例
   */
  static getDb(): ReturnType<typeof drizzle> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * 测试数据库连接
   */
  static async testConnection(): Promise<boolean> {
    try {
      await this.client!`SELECT 1`;
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }

  /**
   * 关闭数据库连接
   */
  static async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
      this.db = null;
    }
  }
}
```

### 2. Drizzle Schema 定义

```typescript
import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * conversations 表 schema
 */
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
  taskId: varchar('task_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  error: text('error'),
}, (table) => ({
  sessionIdIdx: index('idx_conversations_session_id').on(table.sessionId),
  taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
  statusIdx: index('idx_conversations_status').on(table.status),
  createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
}));

/**
 * messages 表 schema
 */
export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  role: varchar('role', { length: 50 }).notNull(),
  content: text('content').notNull(),
  isComplete: boolean('is_complete').notNull().default(true),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  parentMessageId: uuid('parent_message_id'),
}, (table) => ({
  conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
  branchIdIdx: index('idx_messages_branch_id').on(table.branchId),
  timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
  parentMessageIdIdx: index('idx_messages_parent_message_id').on(table.parentMessageId),
}));

// ... 其他表的 schema 定义
```

### 3. 数据库存储实现

```typescript
import { eq, and, desc } from 'drizzle-orm';

/**
 * 基于 Drizzle ORM 的对话存储实现
 */
export class DrizzleConversationStorage implements IConversationStorage {
  private db: ReturnType<typeof drizzle>;
  private cache: Map<string, any>;  // 内存缓存

  constructor(db: ReturnType<typeof drizzle>);

  // 实现 IConversationStorage 接口的所有方法
  
  /**
   * 保存会话
   * 示例：await db.insert(conversations).values(session)
   */
  async saveSession(session: ConversationSession): Promise<void>;
  
  /**
   * 加载会话
   * 示例：await db.select().from(conversations).where(eq(conversations.id, sessionId))
   */
  async loadSession(sessionId: string): Promise<ConversationSession | null>;
  
  /**
   * 通过 Agent sessionId 加载会话
   * 示例：await db.select().from(conversations).where(eq(conversations.sessionId, agentSessionId))
   */
  async loadSessionByAgentSessionId(agentSessionId: string): Promise<ConversationSession | null>;
  
  /**
   * 列出所有会话
   * 示例：await db.select().from(conversations).orderBy(desc(conversations.createdAt))
   */
  async listSessions(): Promise<ConversationSession[]>;
  
  /**
   * 保存消息
   * 示例：await db.insert(messages).values(message)
   */
  async saveMessage(message: ConversationMessage): Promise<void>;
  
  /**
   * 加载消息列表（支持分页）
   * 示例：await db.select().from(messages).where(eq(messages.conversationId, sessionId)).limit(limit).offset(offset)
   */
  async loadMessages(sessionId: string, branchId?: string, options?: PaginationOptions): Promise<ConversationMessage[]>;
  
  async loadMessage(sessionId: string, messageId: string): Promise<ConversationMessage | null>;
  async saveContext(sessionId: string, context: ConversationContext): Promise<void>;
  async loadContext(sessionId: string): Promise<ConversationContext | null>;
  async saveBranch(sessionId: string, branch: ConversationBranch): Promise<void>;
  async loadBranch(sessionId: string, branchId: string): Promise<ConversationBranch | null>;
  
  /**
   * 删除会话（应用层级联删除）
   * 需要手动删除相关的 messages, branches, contexts, metadata
   */
  async deleteSession(sessionId: string): Promise<void>;

  // 新增方法
  async saveMessageMetadata(messageId: string, metadata: MessageMetadata): Promise<void>;
  
  /**
   * 更新消息内容（用于流式响应）
   * 示例：await db.update(messages).set({ content, isComplete }).where(eq(messages.id, messageId))
   */
  async updateMessageContent(messageId: string, content: string, isComplete: boolean): Promise<void>;
  
  async getMessageCount(sessionId: string, branchId?: string): Promise<number>;
  
  // 数据完整性维护（无外键约束下的应用层处理）
  /**
   * 清理孤立的消息（没有对应 conversation 的消息）
   */
  async cleanupOrphanedMessages(): Promise<number>;
  
  /**
   * 清理孤立的分支
   */
  async cleanupOrphanedBranches(): Promise<number>;
  
  /**
   * 清理孤立的元数据
   */
  async cleanupOrphanedMetadata(): Promise<number>;
  
  /**
   * 验证数据完整性
   */
  async validateDataIntegrity(sessionId: string): Promise<{
    valid: boolean;
    issues: string[];
  }>;
}
```

### 4. 流式响应管理（基于 SSE）

```typescript
/**
 * 流式消息状态
 */
export interface StreamingMessageState {
  messageId: string;
  sessionId: string;
  content: string;          // 当前累积的内容
  isComplete: boolean;      // 是否完成
  lastUpdateAt: Date;       // 最后更新时间
}

/**
 * SSE 事件类型
 */
export enum SSEEventType {
  CHUNK = 'chunk',          // 内容片段
  COMPLETE = 'complete',    // 完成
  ERROR = 'error',          // 错误
  HEARTBEAT = 'heartbeat'   // 心跳
}

/**
 * SSE 事件数据
 */
export interface SSEEvent {
  type: SSEEventType;
  messageId: string;
  data?: string;            // 内容片段或错误信息
  timestamp: number;
}

/**
 * 流式响应管理器（基于 SSE）
 */
export class StreamingResponseManager {
  private activeStreams: Map<string, StreamingMessageState>;
  private sseConnections: Map<string, Response>;  // SSE 连接管理

  /**
   * 开始流式响应，建立 SSE 连接
   */
  async startStream(sessionId: string, messageId: string, res: Response): Promise<void>;

  /**
   * 追加流式内容，通过 SSE 推送
   */
  async appendContent(messageId: string, chunk: string): Promise<void>;

  /**
   * 完成流式响应，关闭 SSE 连接
   */
  async completeStream(messageId: string): Promise<void>;

  /**
   * 中断流式响应
   */
  async abortStream(messageId: string, reason?: string): Promise<void>;

  /**
   * 获取流式状态
   */
  getStreamState(messageId: string): StreamingMessageState | null;

  /**
   * 发送 SSE 事件
   */
  private sendSSEEvent(messageId: string, event: SSEEvent): void;

  /**
   * 发送心跳保持连接
   */
  private sendHeartbeat(messageId: string): void;
}
```

### 5. 前端 SSE 客户端和打字机效果

```typescript
/**
 * SSE 客户端配置
 */
export interface SSEClientConfig {
  reconnect: boolean;       // 是否自动重连
  reconnectInterval: number; // 重连间隔（毫秒）
  maxReconnectAttempts: number; // 最大重连次数
}

/**
 * SSE 客户端
 */
export class SSEClient {
  private eventSource: EventSource | null;
  private config: SSEClientConfig;

  /**
   * 连接到 SSE 端点
   */
  connect(url: string, onMessage: (event: SSEEvent) => void): void;

  /**
   * 断开连接
   */
  disconnect(): void;

  /**
   * 获取连接状态
   */
  getReadyState(): number;
}

/**
 * 打字机效果配置
 */
export interface TypewriterConfig {
  speed: number;            // 字符显示速度（毫秒/字符）
  minSpeed: number;         // 最小速度
  maxSpeed: number;         // 最大速度
  pauseOnScroll: boolean;   // 滚动时暂停
  autoScroll: boolean;      // 自动滚动到最新消息
}

/**
 * 打字机效果 Hook（配合 SSE 使用）
 */
export function useTypewriter(
  content: string,
  config: TypewriterConfig
): {
  displayedContent: string;
  isTyping: boolean;
  progress: number;
  pause: () => void;
  resume: () => void;
  skip: () => void;
};

/**
 * SSE 流式消息 Hook
 */
export function useSSEStream(
  sessionId: string,
  messageId: string
): {
  content: string;
  isComplete: boolean;
  error: string | null;
  reconnect: () => void;
};
```

## 数据模型

### 设计原则

#### 1. Session ID 关联
每个对话会话都与 Agent 执行的 `session_id` 关联，这样可以：
- 通过 `session_id` 快速查询对话历史
- 将对话数据与 Agent 执行上下文关联
- 支持跨系统的会话追踪和调试

#### 2. 无外键约束设计
数据库表之间不使用外键约束，原因如下：
- **灵活性**：允许应用层控制数据完整性逻辑
- **性能**：避免外键检查带来的性能开销
- **扩展性**：便于未来的数据分片和分布式部署
- **容错性**：允许部分数据缺失而不影响其他数据的访问

应用层需要负责：
- 在删除对话时，手动清理相关的消息、分支和元数据
- 在查询时，处理可能的数据不一致情况
- 提供数据修复工具，定期检查和修复孤立数据

### 数据库表结构

#### 1. conversations 表

```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR(255) NOT NULL UNIQUE,  -- Agent 执行的 sessionId
  task_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error TEXT,
  
  -- 索引
  INDEX idx_conversations_session_id (session_id),
  INDEX idx_conversations_task_id (task_id),
  INDEX idx_conversations_status (status),
  INDEX idx_conversations_created_at (created_at DESC)
);
```

#### 2. conversation_contexts 表

```sql
CREATE TABLE conversation_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  work_dir TEXT NOT NULL,
  git_branch VARCHAR(255),
  relevant_files JSONB,
  task_description TEXT NOT NULL,
  current_branch_id UUID NOT NULL,
  variables JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 唯一约束
  UNIQUE (conversation_id),
  
  -- 索引
  INDEX idx_contexts_conversation_id (conversation_id)
);
```

#### 3. branches 表

```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  parent_message_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 索引
  INDEX idx_branches_conversation_id (conversation_id),
  INDEX idx_branches_parent_message_id (parent_message_id),
  INDEX idx_branches_is_active (is_active)
);
```

#### 4. messages 表

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT true,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  parent_message_id UUID,
  
  -- 索引
  INDEX idx_messages_conversation_id (conversation_id),
  INDEX idx_messages_branch_id (branch_id),
  INDEX idx_messages_timestamp (timestamp),
  INDEX idx_messages_parent_message_id (parent_message_id)
);
```

#### 5. message_metadata 表

```sql
CREATE TABLE message_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  tool_calls JSONB,
  code_changes JSONB,
  thinking TEXT,
  is_question BOOLEAN DEFAULT false,
  question_options JSONB,
  requires_response BOOLEAN DEFAULT false,
  references JSONB,
  is_invalid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 唯一约束
  UNIQUE (message_id),
  
  -- 索引
  INDEX idx_metadata_message_id (message_id),
  INDEX idx_metadata_is_question (is_question),
  INDEX idx_metadata_requires_response (requires_response)
);
```

### TypeScript 类型映射

```typescript
/**
 * 数据库行类型
 */
export interface ConversationRow {
  id: string;
  session_id: string;        // Agent 执行的 sessionId
  task_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  branch_id: string;
  role: string;
  content: string;
  is_complete: boolean;
  timestamp: string;
  parent_message_id: string | null;
}

export interface BranchRow {
  id: string;
  conversation_id: string;
  name: string;
  parent_message_id: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MessageMetadataRow {
  id: string;
  message_id: string;
  tool_calls: any;
  code_changes: any;
  thinking: string | null;
  is_question: boolean;
  question_options: any;
  requires_response: boolean;
  references: any;
  is_invalid: boolean;
  created_at: string;
}

export interface ConversationContextRow {
  id: string;
  conversation_id: string;
  work_dir: string;
  git_branch: string | null;
  relevant_files: any;
  task_description: string;
  current_branch_id: string;
  variables: any;
  created_at: string;
  updated_at: string;
}
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证的正确性保证之间的桥梁。*

### 属性 1: Session ID 唯一性
*对于任意*两个不同的对话会话，它们的 `session_id` 必须不同，确保每个 Agent 执行会话都有唯一标识。
**验证需求: 1.1, 3.1**

### 属性 2: 消息保存完整性
*对于任意*保存的消息，从数据库查询该消息应该返回相同的内容、角色和时间戳。
**验证需求: 4.1, 4.2**

### 属性 3: 流式响应最终一致性
*对于任意*流式响应，当响应完成时，数据库中保存的完整内容应该等于所有推送片段的累积内容。
**验证需求: 5.3**

### 属性 4: 分页查询一致性
*对于任意*会话的消息列表，通过分页查询获取的所有消息，按顺序拼接后应该等于一次性查询的结果。
**验证需求: 4.5**

### 属性 5: 会话删除级联性
*对于任意*被删除的会话，该会话相关的所有消息、分支和上下文数据都应该被清理（应用层实现）。
**验证需求: 3.5**

### 属性 6: SSE 连接中断恢复
*对于任意*中断的 SSE 连接，重新连接后应该能够获取到中断期间遗漏的消息内容。
**验证需求: 5.4**

### 属性 7: 并发写入安全性
*对于任意*两个并发的消息保存操作，它们都应该成功保存，且不会相互覆盖。
**验证需求: 9.4**

### 属性 8: 数据库连接重试
*对于任意*数据库连接失败，系统应该自动重试，且最终能够恢复正常操作。
**验证需求: 10.1**

### 属性 9: Agent Session 关联查询
*对于任意*有效的 Agent `session_id`，通过该 ID 查询应该返回对应的对话会话及其完整历史。
**验证需求: 3.3**

### 属性 10: 消息时间顺序性
*对于任意*会话的消息列表，查询返回的消息应该按照时间戳严格递增排序。
**验证需求: 4.3**

## 错误处理

### 数据库连接错误
- 连接失败时自动重试，最多 3 次
- 重试间隔采用指数退避策略（1s, 2s, 4s）
- 所有重试失败后，返回明确的错误信息

### SSE 连接错误
- 客户端断开时，清理服务器端的连接状态
- 超时未收到心跳时，主动关闭连接
- 支持客户端重连，并同步遗漏的内容

### 数据完整性错误
- 查询不存在的关联数据时，返回 null 而不是抛出异常
- 定期运行数据完整性检查任务
- 提供数据修复工具清理孤立数据

### 并发冲突
- 使用乐观锁处理并发更新
- 冲突时返回明确的错误信息，由调用方决定重试策略

## 测试策略

### 单元测试
- 测试每个存储方法的基本功能
- 测试错误处理逻辑
- 测试数据转换和映射

### 集成测试
- 测试完整的消息保存和查询流程
- 测试 SSE 流式响应的端到端流程
- 测试数据库连接池和重试机制

### 性能测试
- 测试大量消息的查询性能
- 测试并发写入的性能
- 测试分页查询的性能

### 属性测试
- 使用 fast-check 库进行属性测试
- 每个属性测试运行至少 100 次迭代
- 生成随机的会话、消息和分支数据进行测试

