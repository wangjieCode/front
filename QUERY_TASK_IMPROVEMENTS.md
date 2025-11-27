# 查询类任务优化

## 改进内容

### 1. 延迟创建分支 ✅

**问题**：之前所有任务都会立即创建分支，即使是查询类任务也会创建无用的分支。

**解决方案**：
- 先执行 qodercli
- 检查是否有代码变更
- 只有在有变更时才创建分支

**执行流程**：
```
1. 连接 SSH
2. 执行 qodercli
3. 检查 Git 状态
   ├─ 无变更 → 标记成功（查询类任务）
   └─ 有变更 → 创建分支 → 提交 → 推送 → 创建 MR
```

### 2. 展示查询结果 ✅

**问题**：查询类任务执行完成后，前端只显示状态，看不到查询结果。

**解决方案**：
- 保存 qodercli 的原始输出作为查询结果
- 在任务详情中展示查询结果
- 添加"查询类任务"的提示信息

## 技术实现

### 后端改动

#### 1. Task 接口添加 result 字段

```typescript
export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  branchName?: string;
  mrUrl?: string;
  result?: string;  // 查询类任务的结果
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}
```

#### 2. 调整执行流程

```typescript
// 步骤 1: 连接 SSH
await this.step1_ConnectSSH(taskId);

// 步骤 2: 调用 qodercli（先不创建分支）
const aiResult = await this.step2_ModifyCode(taskId, task.prompt);

// 检查是否有代码变更
const hasChanges = await this.gitService.hasUncommittedChanges();

if (!hasChanges) {
  // 查询类任务：保存结果，直接标记为成功
  if (aiResult.rawOutput) {
    this.taskManager.setTaskResult(taskId, aiResult.rawOutput);
  }
  this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
} else {
  // 代码修改任务：创建分支并继续后续步骤
  await this.step3_CreateBranch(taskId, task.branchName!);
  await this.step4_CommitCode(taskId, task.prompt);
  await this.step5_PushBranch(taskId, task.branchName!);
  const mrUrl = await this.step6_CreateMR(taskId, task.prompt, task.branchName!);
  // ...
}
```

#### 3. 添加 setTaskResult 方法

```typescript
// Task.ts
export function setTaskResult(task: Task, result: string): void {
  task.result = result;
}

// TaskManager.ts
setTaskResult(taskId: string, result: string): void {
  const task = this.tasks.get(taskId);
  setTaskResult(task, result);
}
```

### 前端改动

#### 1. Task 接口添加 result 字段

```typescript
export interface Task {
  id: string;
  prompt: string;
  status: TaskStatus;
  branchName?: string;
  mrUrl?: string;
  result?: string;  // 查询类任务的结果
  createdAt: string;
  completedAt?: string;
  error?: string;
}
```

#### 2. TaskExecutionView 显示查询结果

```tsx
{task.result && !task.mrUrl && (
  <Descriptions.Item label="查询结果">
    <pre style={{ 
      background: '#f5f5f5', 
      padding: '12px', 
      borderRadius: '4px',
      maxHeight: '300px',
      overflow: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word'
    }}>
      {task.result}
    </pre>
  </Descriptions.Item>
)}

{task.result && !task.mrUrl && (
  <Alert
    message="查询类任务"
    description="此任务为查询类任务，无需创建代码变更和 Merge Request"
    type="info"
    showIcon
  />
)}
```

## 测试验证

### 测试 1：查询类任务

**提示词**：
```
查找 getMatingTools 方法在哪里被调用
```

**预期结果**：
- ✅ 状态：success
- ✅ MR URL：null
- ✅ 分支名称：有（但未推送）
- ✅ 查询结果：有内容（573 字符）
- ✅ 日志：显示"这是一个查询类任务，无需提交代码"
- ✅ 前端：显示查询结果和提示信息

**执行日志**：
```
info: 🔌 正在连接到远程虚拟机...
info: ✅ SSH 连接成功
info: 🤖 正在使用 AI 修改代码...
info: 提示词: 查找 getMatingTools 方法在哪里被调用
info: ✅ 代码修改完成，共 0 个文件变更
info: 📋 这是一个查询类任务，无需提交代码
info: ✅ 任务执行成功！
```

### 测试 2：代码修改任务

**提示词**：
```
将 public/index.html 的 title 改为「测试」
```

**预期结果**：
- ✅ 状态：success
- ✅ MR URL：有效链接
- ✅ 分支名称：有（已推送）
- ✅ 查询结果：null
- ✅ 日志：包含创建分支、提交、推送、创建 MR 的步骤

**执行日志**：
```
info: 🔌 正在连接到远程虚拟机...
info: ✅ SSH 连接成功
info: 🤖 正在使用 AI 修改代码...
info: ✅ 代码修改完成，共 1 个文件变更
info: 📝 检测到代码变更，开始创建分支
info: 🌿 正在创建分支: feature/task-xxx
info: ✅ 分支已就绪
info: 📝 正在提交代码...
info: ✅ 代码已提交
info: 🚀 正在推送分支...
info: ✅ 分支已推送到远程仓库
info: 📋 正在创建 Merge Request...
info: ✅ Merge Request 已创建
info: ✅ 任务执行成功！
```

## 优势

### 1. 性能优化
- 查询类任务不创建分支，减少 Git 操作
- 不推送无用的分支到远程仓库
- 执行速度更快

### 2. 用户体验
- 查询结果直接显示在前端
- 清晰区分查询任务和修改任务
- 无需打开日志即可看到查询结果

### 3. 资源节约
- 不创建无用的分支
- 不创建无用的 MR
- 减少 GitLab 服务器负载

## 前端展示效果

### 查询类任务

```
┌─────────────────────────────────────┐
│ 任务详情                             │
├─────────────────────────────────────┤
│ 任务 ID: xxx                         │
│ 状态: ✅ 已完成                      │
│ 任务描述: 查找 getMatingTools...    │
│ 查询结果:                            │
│ ┌─────────────────────────────────┐ │
│ │ getMatingTools 方法在以下位置   │ │
│ │ 被调用：                         │ │
│ │ - src/store/modules/common.js   │ │
│ │ - src/views/marketing/index.vue │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ ℹ️ 查询类任务                        │
│ 此任务为查询类任务，无需创建代码     │
│ 变更和 Merge Request                │
└─────────────────────────────────────┘
```

### 代码修改任务

```
┌─────────────────────────────────────┐
│ 任务详情                             │
├─────────────────────────────────────┤
│ 任务 ID: xxx                         │
│ 状态: ✅ 已完成                      │
│ 任务描述: 将 title 改为「测试」     │
│ 分支名称: feature/task-xxx          │
│ Merge Request: https://gitlab...    │
└─────────────────────────────────────┘
```

## 注意事项

1. **分支名称仍会生成**：即使是查询类任务，也会生成分支名称（但不会创建实际分支）
2. **本地分支不会创建**：查询类任务不会在本地创建分支
3. **结果长度限制**：查询结果可能很长，前端设置了最大高度和滚动
4. **结果格式**：查询结果以纯文本形式展示，保留原始格式

## 未来优化

1. **结果格式化**：根据内容类型（JSON、代码等）进行格式化
2. **结果高亮**：对代码片段进行语法高亮
3. **结果导出**：支持导出查询结果为文件
4. **结果搜索**：在查询结果中搜索关键词
5. **历史查询**：缓存查询结果，避免重复查询
