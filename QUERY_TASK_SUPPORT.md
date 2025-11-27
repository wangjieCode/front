# 查询类任务支持

## 功能说明

系统现在支持自动识别查询类任务，无需手动区分任务类型。

## 工作原理

1. **执行 qodercli**：所有任务都会先执行 qodercli
2. **检查代码变更**：执行完成后，检查 Git 工作区是否有未提交的变更
3. **自动判断任务类型**：
   - **有代码变更** → 代码修改任务 → 提交代码 + 推送分支 + 创建 MR
   - **无代码变更** → 查询类任务 → 直接标记为成功，跳过提交和 MR

## 示例

### 查询类任务

**提示词**：
```
admin/promotion/list-tools-v2 这个接口在项目中用在哪里？
```

**执行流程**：
1. ✅ 创建分支
2. ✅ 执行 qodercli（AI 会搜索代码并返回结果）
3. ✅ 检查 Git 状态 → 无变更
4. ✅ 标记为成功，无需创建 MR

**日志输出**：
```
🤖 正在使用 AI 修改代码...
✅ 代码修改完成，共 0 个文件变更
📋 这是一个查询类任务，无需提交代码
✅ 任务执行成功！
```

### 代码修改任务

**提示词**：
```
将 public/index.html 的 title 改为「前端助手」
```

**执行流程**：
1. ✅ 创建分支
2. ✅ 执行 qodercli（AI 会修改代码）
3. ✅ 检查 Git 状态 → 有变更
4. ✅ 提交代码
5. ✅ 推送分支
6. ✅ 创建 MR

**日志输出**：
```
🤖 正在使用 AI 修改代码...
✅ 代码修改完成，共 1 个文件变更
📝 正在提交代码...
✅ 代码已提交
🚀 正在推送分支...
✅ 分支已推送到远程仓库
📋 正在创建 Merge Request...
✅ Merge Request 已创建
✅ 任务执行成功！
```

## 技术实现

### GitService.hasUncommittedChanges()

```typescript
async hasUncommittedChanges(): Promise<boolean> {
  const result = await this.sshExecutor.executeCommand(
    'git status --porcelain',
    this.workDir
  );
  // 如果输出为空，说明工作区是干净的（没有变更）
  return result.stdout.trim().length > 0;
}
```

### TaskOrchestrator 执行流程

```typescript
// 步骤 3: 调用 qodercli 修改代码
const changes = await this.step3_ModifyCode(taskId, task.prompt);

// 检查是否有代码变更
const hasChanges = await this.gitService.hasUncommittedChanges();

if (!hasChanges) {
  // 查询类任务：没有代码变更，直接标记为成功
  this.addLog(taskId, 'info', 'system', '📋 这是一个查询类任务，无需提交代码');
  this.taskManager.updateTaskStatus(taskId, TaskStatus.SUCCESS);
  this.wsServer.sendTaskCompleted(taskId);
} else {
  // 代码修改任务：继续提交和创建 MR
  await this.step4_CommitCode(taskId, task.prompt);
  await this.step5_PushBranch(taskId, task.branchName!);
  const mrUrl = await this.step6_CreateMR(taskId, task.prompt, task.branchName!);
  // ...
}
```

## 优势

1. **自动识别**：无需手动指定任务类型
2. **智能判断**：基于实际的代码变更情况
3. **灵活处理**：qodercli 可以自由决定是否修改代码
4. **简化流程**：查询类任务不会创建无用的分支和 MR

## 常见查询类任务

- 查找接口使用位置
- 查找函数定义
- 查找组件引用
- 代码结构分析
- 依赖关系查询
- 配置信息查询

## 注意事项

1. **分支仍会创建**：即使是查询类任务，也会创建分支（但不会推送）
2. **qodercli 决定**：是否修改代码完全由 qodercli 决定
3. **Git 检查**：基于 `git status --porcelain` 的输出判断
4. **清理分支**：查询类任务的本地分支可以定期清理

## 测试验证

### 测试查询类任务

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"查找 xxx 接口在哪里使用"}'
```

**预期结果**：
- 任务状态：success
- MR URL：null
- 日志包含："这是一个查询类任务，无需提交代码"

### 测试代码修改任务

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt":"修改 xxx 文件"}'
```

**预期结果**：
- 任务状态：success
- MR URL：有效的 GitLab MR 链接
- 日志包含：提交、推送、创建 MR 的步骤

## 未来优化

1. **分支清理**：自动清理查询类任务创建的本地分支
2. **缓存结果**：缓存查询结果，避免重复查询
3. **结果展示**：在前端更好地展示查询结果
4. **任务分类**：在任务列表中区分查询任务和修改任务
