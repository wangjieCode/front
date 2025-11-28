# Query 任务执行修复设计文档

## 概述

本设计文档描述如何修复 query 类型任务的执行问题，确保 AI 工具能够正确处理只读查询请求并返回有意义的结果。

当前问题：在 `TaskOrchestrator.ts` 中，query 类型的任务只是简单地将用户的输入（`task.prompt`）保存为结果，而没有调用 AI 工具来处理查询。

## 架构

### 整体流程

```
用户请求 (query)
    ↓
TaskManager 创建任务
    ↓
TaskOrchestrator 执行任务
    ↓
CodeToolService 调用 AI 工具（只读模式）
    ↓
NeovateProvider 执行 neovate 命令
    ↓
流式输出 → WebSocket → 前端实时展示
    ↓
保存结果到任务
    ↓
前端展示最终结果
```

### 关键变更点

1. **TaskOrchestrator**: 修改 query 任务的处理逻辑，调用 AI 工具而不是直接返回提示词
2. **CodeToolService**: 确保支持只读模式的查询
3. **NeovateProvider**: 已支持流式输出，无需修改
4. **前端**: 已支持解析和展示结果，无需修改

## 组件设计

### 1. TaskOrchestrator 修改

#### 当前实现（有问题）

```typescript
if (task.type === TaskType.QUERY) {
  // 只读模式：不调用代码工具，直接返回提示词作为结果
  this.addLog(taskId, 'info', 'system', '📋 只读模式：不修改代码');
  
  // 保存提示词作为查询结果 ❌ 这是错误的！
  this.taskManager.setTaskResult(taskId, task.prompt);
  
  this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
  this.addLog(taskId, 'info', 'system', '✅ 只读任务执行成功！');
}
```

#### 修复后的实现

```typescript
if (task.type === TaskType.QUERY) {
  // 只读模式：调用 AI 工具但不修改代码
  this.addLog(taskId, 'info', 'system', '📋 只读模式：查询代码库');
  
  // 步骤 3: 调用 AI 工具处理查询
  const aiResult = await this.step3_QueryCode(taskId, task.prompt);
  
  // 保存 AI 的回答作为结果
  if (aiResult.rawOutput) {
    this.taskManager.setTaskResult(taskId, aiResult.rawOutput);
  }
  
  this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
  this.addLog(taskId, 'info', 'system', '✅ 查询任务执行成功！');
}
```

#### 新增方法：step3_QueryCode

```typescript
/**
 * 步骤 3: 调用 AI 工具处理查询（只读模式）
 */
private async step3_QueryCode(taskId: string, prompt: string): Promise<any> {
  const toolName = this.codeToolService.getToolName();

  this.addLog(taskId, 'info', 'codetool', `🤖 正在使用 ${toolName} 查询代码库...`);
  this.addLog(taskId, 'info', 'codetool', `查询内容: ${prompt}`);

  // 使用流式输出执行查询
  const result = await this.codeToolService.modifyCodeStream(
    prompt,
    this.workDir,
    (data: string) => {
      // 添加日志到任务管理器，前端会通过 WebSocket 实时获取
      this.taskManager.addLog(taskId, createInfoLog('codetool', data));
    },
    (error: string) => {
      // 添加错误日志到任务管理器
      this.taskManager.addLog(taskId, createErrorLog('codetool', error));
    }
  );

  if (!result.success) {
    throw new Error(`AI 查询失败: ${result.error}`);
  }

  this.addLog(
    taskId,
    'info',
    'codetool',
    `✅ 查询完成`
  );

  return result;
}
```

### 2. 执行流程对比

#### Code Change 任务流程（编辑模式）

```
1. 连接 SSH
2. 准备工作区
3. 调用 AI 工具修改代码
4. 检查是否有代码变更
   ├─ 有变更：
   │   5. 创建分支
   │   6. 提交代码
   │   7. 推送分支
   │   8. 创建 MR
   └─ 无变更：
       保存 AI 输出作为结果
```

#### Query 任务流程（只读模式）

```
1. 连接 SSH
2. 准备工作区
3. 调用 AI 工具查询代码库
4. 保存 AI 输出作为结果
```

### 3. 数据模型

#### Task 模型（已存在，无需修改）

```typescript
interface Task {
  id: string;
  prompt: string;
  type: TaskType;  // 'code_change' | 'query'
  status: TaskStatus;
  result?: string;  // AI 的输出结果
  error?: string;
  mrUrl?: string;
  branchName?: string;
  createdAt: string;
  completedAt?: string;
}
```

#### CodeToolResult 模型（已存在，无需修改）

```typescript
interface CodeToolResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  error?: string;
  rawOutput?: string;  // AI 的原始输出
}
```

### 4. 前端展示逻辑

前端已经实现了结果展示逻辑（在 `TaskExecutionView.tsx` 中），能够：

1. 解析 neovate 的 stream-json 格式输出
2. 提取 `type: 'result'` 的消息
3. 展示最终结果

#### 结果解析逻辑（已存在）

```typescript
{task.result && !task.mrUrl && (() => {
  try {
    // 按换行符分割 JSON 对象
    const lines = task.result.trim().split('\n').filter(line => line.trim());
    
    // 提取最终的 result 消息
    let finalResult = null;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'result') {
          finalResult = parsed;
          break;
        }
      } catch (e) {
        // 跳过无法解析的行
      }
    }

    // 如果找到了 result 消息，展示它
    if (finalResult && finalResult.content) {
      return (
        <div>展示结果...</div>
      );
    }

    // 如果没有找到 result 消息，显示原始内容
    return (
      <div>
        <Text style={{ whiteSpace: 'pre-wrap' }}>
          {task.result}
        </Text>
      </div>
    );
  } catch (e) {
    // 普通文本
    return (
      <div>
        <Text style={{ whiteSpace: 'pre-wrap' }}>
          {task.result}
        </Text>
      </div>
    );
  }
})()}
```

## 错误处理

### 1. AI 工具不可用

```typescript
// 在 TaskOrchestrator 中
if (task.type === TaskType.QUERY) {
  // 检查工具可用性
  const toolAvailable = await this.codeToolService.isAvailable(this.workDir);
  if (!toolAvailable) {
    const toolName = this.codeToolService.getToolName();
    throw new Error(
      `代码工具 ${toolName} 不可用。请确保 ${toolName} 已安装并在 PATH 中。`
    );
  }
  
  // 继续执行查询...
}
```

### 2. AI 工具执行失败

```typescript
const result = await this.codeToolService.modifyCodeStream(...);

if (!result.success) {
  throw new Error(`AI 查询失败: ${result.error}`);
}
```

### 3. 超时处理

```typescript
// 在 SSHExecutor 中已经实现了超时机制
// 默认超时时间为 5 分钟
```

### 4. 网络连接失败

```typescript
// 在 step1_ConnectSSH 中已经处理
const isConnected = await this.sshExecutor.testConnection();
if (!isConnected) {
  throw new Error('SSH 连接测试失败');
}
```

## 测试策略

### 单元测试

#### 测试 TaskOrchestrator.executeTask (query 类型)

```typescript
describe('TaskOrchestrator - Query Task', () => {
  it('should call AI tool for query task', async () => {
    const task = createTask('查询代码库', TaskType.QUERY);
    const mockResult = {
      success: true,
      message: 'Query completed',
      changes: [],
      rawOutput: '{"type":"result","content":"这是查询结果"}'
    };
    
    jest.spyOn(codeToolService, 'modifyCodeStream').mockResolvedValue(mockResult);
    
    await orchestrator.executeTask(task.id);
    
    expect(codeToolService.modifyCodeStream).toHaveBeenCalledWith(
      task.prompt,
      workDir,
      expect.any(Function),
      expect.any(Function)
    );
    
    const updatedTask = taskManager.getTask(task.id);
    expect(updatedTask.status).toBe(TaskStatus.SUCCESS);
    expect(updatedTask.result).toBe(mockResult.rawOutput);
  });
  
  it('should handle AI tool failure for query task', async () => {
    const task = createTask('查询代码库', TaskType.QUERY);
    const mockResult = {
      success: false,
      message: 'Query failed',
      changes: [],
      error: 'AI tool error'
    };
    
    jest.spyOn(codeToolService, 'modifyCodeStream').mockResolvedValue(mockResult);
    
    await orchestrator.executeTask(task.id);
    
    const updatedTask = taskManager.getTask(task.id);
    expect(updatedTask.status).toBe(TaskStatus.FAILED);
    expect(updatedTask.error).toContain('AI 查询失败');
  });
});
```

### 集成测试

#### 测试完整的 query 任务流程

```typescript
describe('Query Task Integration', () => {
  it('should execute query task end-to-end', async () => {
    // 1. 创建任务
    const response = await request(app)
      .post('/api/tasks')
      .send({
        prompt: '/dataCenter 页面的作用是啥',
        type: 'query'
      });
    
    expect(response.status).toBe(201);
    const taskId = response.body.data.id;
    
    // 2. 等待任务完成
    await waitForTaskCompletion(taskId);
    
    // 3. 获取任务结果
    const taskResponse = await request(app)
      .get(`/api/tasks/${taskId}`);
    
    expect(taskResponse.body.data.status).toBe('success');
    expect(taskResponse.body.data.result).toBeDefined();
    expect(taskResponse.body.data.result).not.toBe('/dataCenter 页面的作用是啥');
  });
});
```

### 手动测试

#### 测试场景 1: 简单查询

```bash
curl 'http://localhost:3000/api/tasks' \
  -H 'Content-Type: application/json' \
  --data-raw '{"prompt":"/dataCenter 页面的作用是啥","type":"query"}'
```

预期结果：
- 任务状态变为 `running`
- WebSocket 实时推送 AI 的输出
- 任务完成后状态变为 `success`
- `result` 字段包含 AI 的回答，而不是用户的问题

#### 测试场景 2: 复杂查询

```bash
curl 'http://localhost:3000/api/tasks' \
  -H 'Content-Type: application/json' \
  --data-raw '{"prompt":"分析 backend/src/services 目录下的所有服务类，列出它们的职责","type":"query"}'
```

预期结果：
- AI 能够读取多个文件
- 返回详细的分析结果
- 前端正确展示结果

#### 测试场景 3: 错误处理

```bash
# 在 AI 工具不可用的情况下
curl 'http://localhost:3000/api/tasks' \
  -H 'Content-Type: application/json' \
  --data-raw '{"prompt":"查询代码","type":"query"}'
```

预期结果：
- 任务状态变为 `failed`
- `error` 字段包含清晰的错误信息
- 前端显示错误提示

## 性能优化

### 1. 流式输出

- 使用 `modifyCodeStream` 而不是 `modifyCode`
- 实时推送输出到前端，提升用户体验

### 2. 超时控制

- 设置合理的超时时间（默认 5 分钟）
- 避免长时间等待

### 3. 日志优化

- 只记录关键日志
- 避免记录过多的流式输出日志

## 兼容性

### 向后兼容

- 不影响现有的 `code_change` 任务流程
- 前端已经支持解析和展示结果，无需修改
- WebSocket 消息格式保持不变

### 前端兼容

- 前端已经实现了结果解析逻辑
- 能够处理 stream-json 格式的输出
- 能够提取和展示最终结果

## 部署注意事项

### 环境变量

确保设置了必要的环境变量：

```bash
# neovate 需要的 API Key
IFLOW_API_KEY=your_api_key_here
```

### 工具安装

确保 AI 工具已安装：

```bash
# 检查 neovate 是否可用
which neovate

# 检查版本
neovate --version
```

### 配置检查

确保 `.env` 文件中配置了正确的工具类型：

```bash
CODE_TOOL=neovate
```

## 总结

本设计通过以下关键修改解决了 query 任务执行的问题：

1. **修改 TaskOrchestrator**: 让 query 任务调用 AI 工具而不是直接返回提示词
2. **新增 step3_QueryCode 方法**: 专门处理只读查询
3. **保持流式输出**: 使用 `modifyCodeStream` 实现实时反馈
4. **前端无需修改**: 现有的结果展示逻辑已经支持

修复后，用户发送 query 类型的任务时，AI 将真正分析代码库并返回有意义的答案，而不是简单地返回用户的问题。
