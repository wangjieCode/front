# 设计文档

## 概述

本设计实现 Neovate AI 代理的上下文保留功能，通过在任务 ID 和 Neovate 会话 ID 之间建立映射关系，使得同一任务的多次 Neovate 调用能够共享上下文。系统将在第一次调用 Neovate 时提取会话 ID，并在后续调用中使用 `--resume` 参数恢复会话。

## 架构

### 整体架构

```
┌─────────────────┐
│  TaskOrchestrator│
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│ NeovateProvider │◄────►│NeovateSessionMgr │
└────────┬────────┘      └────────┬─────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐      ┌──────────────────┐
│  LocalExecutor  │      │  SessionStorage  │
│  SSHExecutor    │      │  (File System)   │
└─────────────────┘      └──────────────────┘
```

### 组件职责

1. **NeovateSessionManager**: 管理任务 ID 到 Neovate 会话 ID 的映射
2. **NeovateProvider**: 调用 Neovate 命令，根据会话状态决定是否使用 `--resume` 参数
3. **SessionStorage**: 持久化存储会话映射关系
4. **TaskOrchestrator**: 协调任务执行和会话管理

## 组件和接口

### NeovateSessionManager

```typescript
/**
 * Neovate 会话管理器
 * 负责管理任务 ID 到 Neovate 会话 ID 的映射
 */
export class NeovateSessionManager {
  /**
   * 获取任务的 Neovate 会话 ID
   * @param taskId 任务 ID
   * @returns Neovate 会话 ID，如果不存在返回 null
   */
  async getSessionId(taskId: string): Promise<string | null>;

  /**
   * 保存任务的 Neovate 会话 ID
   * @param taskId 任务 ID
   * @param neovateSessionId Neovate 会话 ID
   * @param workDir 工作目录
   */
  async saveSessionId(
    taskId: string,
    neovateSessionId: string,
    workDir: string
  ): Promise<void>;

  /**
   * 删除任务的会话映射
   * @param taskId 任务 ID
   */
  async deleteSession(taskId: string): Promise<void>;

  /**
   * 获取会话信息
   * @param taskId 任务 ID
   * @returns 会话信息
   */
  async getSessionInfo(taskId: string): Promise<NeovateSessionInfo | null>;

  /**
   * 清理过期会话（超过 24 小时未使用）
   */
  async cleanupExpiredSessions(): Promise<number>;
}
```

### NeovateProvider 更新

```typescript
/**
 * 使用 neovate 修改代码（流式输出）
 * @param prompt 用户提示词
 * @param workDir 工作目录
 * @param taskId 任务 ID（用于会话管理）
 * @param onData 数据回调
 * @param onError 错误回调
 * @returns 执行结果
 */
async modifyCodeStream(
  prompt: string,
  workDir: string,
  taskId: string,
  onData: (data: string) => void,
  onError?: (data: string) => void
): Promise<CodeToolResult>;
```

### 会话输出解析

Neovate 在执行时会输出会话 ID，需要从输出中提取：

```typescript
/**
 * 从 Neovate 输出中提取会话 ID
 * @param output Neovate 的输出
 * @returns 会话 ID，如果未找到返回 null
 */
function extractSessionId(output: string): string | null;
```

## 数据模型

### NeovateSessionInfo

```typescript
/**
 * Neovate 会话信息
 */
export interface NeovateSessionInfo {
  taskId: string;              // 任务 ID
  neovateSessionId: string;    // Neovate 会话 ID
  workDir: string;             // 工作目录
  createdAt: Date;             // 创建时间
  lastUsedAt: Date;            // 最后使用时间
}
```

### 存储格式

会话映射存储在文件系统中：

```
backend/data/neovate-sessions/
├── index.json                 # 全局索引
└── <taskId>/
    └── session.json          # 会话信息
```

`session.json` 格式：
```json
{
  "taskId": "task-123",
  "neovateSessionId": "session-abc",
  "workDir": "/path/to/workspace",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "lastUsedAt": "2024-01-01T00:00:00.000Z"
}
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的正式陈述。属性作为人类可读规范和机器可验证的正确性保证之间的桥梁。*

### Property 1: 首次调用不使用会话恢复
*对于任何*新任务，第一次调用 Neovate 时，命令中不应包含 `--resume` 参数
**验证: 需求 1.1**

### Property 2: 会话 ID 提取和保存
*对于任何*Neovate 执行输出，如果包含有效的会话 ID，系统应该提取并保存该 ID 与任务 ID 的映射关系
**验证: 需求 1.2**

### Property 3: 后续调用使用会话恢复
*对于任何*已有会话映射的任务，后续调用 Neovate 时，命令中应包含 `--resume <session-id>` 参数
**验证: 需求 1.3**

### Property 4: 新任务创建新映射
*对于任何*新任务，系统应该创建一个新的会话映射记录，且该记录不应与其他任务冲突
**验证: 需求 1.4**

### Property 5: 工作目录切换创建新会话
*对于任何*任务，如果工作目录发生变化，系统应该创建新的 Neovate 会话而不是恢复旧会话
**验证: 需求 1.5**

### Property 6: 会话恢复失败处理
*对于任何*会话恢复失败的情况，系统应该自动创建新会话并继续执行
**验证: 需求 1.6**

### Property 7: 会话映射持久化
*对于任何*会话映射，保存后重新加载应该得到相同的映射关系（round trip）
**验证: 需求 2.3**

### Property 8: 并发任务隔离
*对于任何*两个不同的并发任务，它们的 Neovate 会话 ID 应该是不同的且互不干扰
**验证: 需求 2.4**

### Property 9: 会话信息完整性
*对于任何*保存的会话映射，应该包含所有必需字段：taskId、neovateSessionId、workDir、createdAt、lastUsedAt
**验证: 需求 3.3**

### Property 10: API 密钥传递
*对于任何*Neovate 命令执行，如果 IFLOW_API_KEY 已配置，它应该出现在执行环境的环境变量中
**验证: 需求 4.1, 4.2**

### Property 11: 过期会话清理
*对于任何*超过 24 小时未使用的会话记录，清理操作应该将其删除
**验证: 需求 5.4**

## 错误处理

### 会话 ID 提取失败
- 如果无法从 Neovate 输出中提取会话 ID，记录警告但不影响任务执行
- 下次调用时仍然尝试提取会话 ID

### 会话恢复失败
- 如果使用 `--resume` 参数失败，自动重试不带 `--resume` 参数的调用
- 删除旧的会话映射，保存新的会话 ID

### 存储失败
- 如果无法保存会话映射，记录错误但不影响任务执行
- 任务仍然可以完成，只是下次调用时无法恢复上下文

### API 密钥缺失
- 如果 IFLOW_API_KEY 未配置，记录警告
- 仍然尝试执行命令（Neovate 可能使用默认配置）
- 如果因 API 密钥问题失败，返回明确的错误信息

## 测试策略

### 单元测试

1. **NeovateSessionManager 测试**
   - 测试会话 ID 的保存和获取
   - 测试会话信息的更新
   - 测试会话删除
   - 测试过期会话清理

2. **会话 ID 提取测试**
   - 测试从各种格式的输出中提取会话 ID
   - 测试无效输出的处理

3. **NeovateProvider 集成测试**
   - 测试首次调用不使用 --resume
   - 测试后续调用使用 --resume
   - 测试工作目录切换
   - 测试会话恢复失败的处理

### 属性测试

使用 `fast-check` 库进行属性测试，每个测试运行至少 100 次迭代。

1. **Property 1-6**: 测试会话管理的各种场景
2. **Property 7**: 测试持久化的 round trip
3. **Property 8**: 测试并发场景
4. **Property 9**: 测试数据完整性
5. **Property 10**: 测试环境变量传递
6. **Property 11**: 测试清理逻辑

每个属性测试必须使用注释标记对应的属性编号和需求编号：
```typescript
// Feature: neovate-context-preservation, Property 1: 首次调用不使用会话恢复
// Validates: Requirements 1.1
```

## 实现注意事项

### 会话 ID 格式

Neovate 的会话 ID 格式需要通过实际测试确定。可能的格式：
- UUID 格式：`550e8400-e29b-41d4-a716-446655440000`
- 短 ID 格式：`abc123def`
- 时间戳格式：`session-1234567890`

需要编写灵活的提取逻辑以适应不同格式。

### 并发安全

NeovateSessionManager 需要处理并发访问：
- 使用文件锁或内存锁保护会话映射的读写
- 确保多个任务同时执行时不会相互干扰

### 性能优化

- 在内存中缓存会话映射，减少文件 I/O
- 定期（如每小时）执行过期会话清理，而不是每次调用时都检查

### 向后兼容

- 如果会话映射文件不存在，系统应该能够正常工作（只是没有上下文保留）
- 旧版本创建的任务不受影响
