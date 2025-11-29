# DatabaseManager 使用指南

## 快速开始

### 1. 配置环境变量

在 `.env` 文件中设置数据库连接字符串：

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/conversation_db
```

可选配置：
```env
DB_MAX_CONNECTIONS=10
DB_IDLE_TIMEOUT=20
DB_CONNECTION_TIMEOUT=10
```

### 2. 初始化数据库连接

```typescript
import { initializeDatabase } from './db/init';

// 在应用启动时初始化
await initializeDatabase();
```

### 3. 使用数据库

```typescript
import { DatabaseManager } from './db/DatabaseManager';
import { conversations } from './db/schema';
import { eq } from 'drizzle-orm';

// 获取数据库实例
const db = DatabaseManager.getDb();

// 查询示例
const allConversations = await db.select().from(conversations);

// 插入示例
await db.insert(conversations).values({
  sessionId: 'session-123',
  taskId: 'task-456',
  status: 'active',
});

// 更新示例
await db
  .update(conversations)
  .set({ status: 'completed' })
  .where(eq(conversations.sessionId, 'session-123'));

// 删除示例
await db
  .delete(conversations)
  .where(eq(conversations.sessionId, 'session-123'));
```

### 4. 测试连接

```bash
# 测试数据库连接
pnpm db:test
```

## API 参考

### DatabaseManager

#### `initialize(config: DatabaseConfig): void`
初始化数据库连接。

```typescript
DatabaseManager.initialize({
  connectionString: 'postgresql://...',
  max: 10,
  idleTimeout: 20,
  connectionTimeout: 10,
});
```

#### `getDb(): ReturnType<typeof drizzle>`
获取 Drizzle 数据库实例。

```typescript
const db = DatabaseManager.getDb();
```

#### `getClient(): postgres.Sql`
获取原始 PostgreSQL 客户端。

```typescript
const client = DatabaseManager.getClient();
await client`SELECT * FROM conversations`;
```

#### `testConnection(): Promise<boolean>`
测试数据库连接。

```typescript
const isConnected = await DatabaseManager.testConnection();
```

#### `close(): Promise<void>`
关闭数据库连接。

```typescript
await DatabaseManager.close();
```

#### `isInitialized(): boolean`
检查数据库是否已初始化。

```typescript
if (DatabaseManager.isInitialized()) {
  // 数据库已初始化
}
```

## 最佳实践

### 1. 应用启动时初始化

```typescript
// src/index.ts
import { initializeDatabase, closeDatabase } from './db/init';

async function main() {
  // 初始化数据库
  const dbInitialized = await initializeDatabase();
  if (!dbInitialized) {
    console.error('Failed to initialize database');
    process.exit(1);
  }

  // 启动应用
  // ...

  // 优雅关闭
  process.on('SIGINT', async () => {
    await closeDatabase();
    process.exit(0);
  });
}

main();
```

### 2. 使用事务

```typescript
const db = DatabaseManager.getDb();

await db.transaction(async (tx) => {
  // 在事务中执行多个操作
  await tx.insert(conversations).values({ ... });
  await tx.insert(messages).values({ ... });
});
```

### 3. 错误处理

```typescript
try {
  const db = DatabaseManager.getDb();
  await db.insert(conversations).values({ ... });
} catch (error) {
  console.error('Database operation failed:', error);
  // 处理错误
}
```

### 4. 连接池管理

DatabaseManager 自动管理连接池，无需手动管理连接。配置参数：

- `max`: 最大连接数（默认 10）
- `idleTimeout`: 空闲连接超时时间（默认 20 秒）
- `connectionTimeout`: 连接超时时间（默认 10 秒）

## 故障排查

### 连接失败

1. 检查 `DATABASE_URL` 是否正确设置
2. 确保 PostgreSQL 服务正在运行
3. 验证数据库用户权限
4. 检查防火墙设置

### 连接超时

1. 增加 `connectionTimeout` 配置
2. 检查网络连接
3. 验证数据库服务器负载

### 连接池耗尽

1. 增加 `max` 连接数
2. 检查是否有连接泄漏
3. 优化查询性能
