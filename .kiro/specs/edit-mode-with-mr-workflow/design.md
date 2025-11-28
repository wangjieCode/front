# Design Document

## Overview

本设计为代码助手系统添加编辑模式和只读模式选择功能。用户在提交任务前可以选择模式：
- **编辑模式（CODE_CHANGE）**：使用 qodercli（默认 neovate）修改代码，自动创建 GitLab MR
- **只读模式（QUERY）**：仅返回查询结果，不修改代码

设计原则：最小化改动，复用现有架构。

## Architecture

### 现有架构
系统已具备完整的 MR 工作流：
- `TaskOrchestrator`: 编排任务执行流程
- `CodeToolService`: 管理代码工具（neovate/qodercli）
- `GitService`: Git 操作
- `GitLabMCPService`: 创建 MR
- `TaskManager`: 任务状态管理

### 新增组件
无需新增服务类，仅需：
1. 在 `Task` 模型添加 `type` 字段（已存在 TaskType 枚举）
2. 在前端添加模式选择 UI
3. 在 `TaskOrchestrator` 添加类型判断逻辑（已部分实现）

## Components and Interfaces

### 1. Task 模型扩展

```typescript
// backend/src/types/index.ts (已存在)
export enum TaskType {
  CODE_CHANGE = 'code_change',  // 编辑模式
  QUERY = 'query'                // 只读模式
}

export interface Task {
  id: string;
  prompt: string;
  type: TaskType;  // 新增字段
  status: TaskStatus;
  branchName?: string;
  mrUrl?: string;
  result?: string;
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}
```

### 2. 前端模式选择组件

```typescript
// frontend/src/components/TaskInputPanel.tsx
interface ModeOption {
  value: TaskType;
  label: string;
  description: string;
}

const modes: ModeOption[] = [
  {
    value: 'code_change',
    label: '编辑模式',
    description: '允许 AI 修改代码并创建 MR'
  },
  {
    value: 'query',
    label: '只读模式',
    description: '仅查询信息，不修改代码'
  }
];
```

### 3. TaskOrchestrator 逻辑调整

当前实现已通过 `hasUncommittedChanges()` 判断是否有代码变更：
- 有变更 → 创建分支、提交、推送、创建 MR
- 无变更 → 标记为查询任务，保存结果

**简化方案**：
- 编辑模式（CODE_CHANGE）：调用 `codeToolService.modifyCodeStream()`
- 只读模式（QUERY）：跳过代码工具调用，直接返回提示词作为结果

## Data Models

### Task 创建请求

```typescript
// POST /api/tasks
{
  "prompt": "用户提示词",
  "type": "code_change" | "query"  // 新增字段
}
```

### Task 响应

```typescript
{
  "id": "task-123",
  "prompt": "用户提示词",
  "type": "code_change",
  "status": "running",
  "branchName": "task-123-feature",
  "mrUrl": "https://gitlab.com/project/merge_requests/1",
  "result": null,  // 仅 QUERY 类型使用
  "createdAt": "2025-11-28T10:00:00Z"
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 模式选择持久化
*For any* Task, when created with a specific TaskType, the Task SHALL retain that TaskType throughout its lifecycle
**Validates: Requirements 1.4**

### Property 2: 编辑模式完整工作流
*For any* Task with TaskType CODE_CHANGE that successfully modifies code, the System SHALL invoke the Code Tool Provider, create a branch, commit changes, push the branch, and create a Merge Request
**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

### Property 3: 只读模式无副作用
*For any* Task with TaskType QUERY, the System SHALL not invoke the Code Tool Provider, SHALL not create branches, SHALL not commit changes, and SHALL not create Merge Requests
**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 4: 查询结果返回
*For any* Task with TaskType QUERY that completes successfully, the result field SHALL be non-null
**Validates: Requirements 4.5**

### Property 5: MR 内容完整性
*For any* Merge Request created by the System, the MR title SHALL be derived from the Task prompt, the MR description SHALL contain the Task ID, and the title length SHALL not exceed 255 characters
**Validates: Requirements 2.6, 6.3, 6.4, 6.5**

### Property 6: 分支命名规范
*For any* branch created for a CODE_CHANGE Task, the branch name SHALL contain the Task ID and SHALL follow Git branch naming conventions
**Validates: Requirements 6.1, 6.2**

### Property 7: MR URL 持久化
*For any* Task with TaskType CODE_CHANGE that successfully creates an MR, the mrUrl field SHALL be non-null and accessible after task completion
**Validates: Requirements 3.1, 3.5**

### Property 8: 错误处理完整性
*For any* Task that fails at any step (code tool execution, branch creation, commit, push, or MR creation), the System SHALL set the task status to FAILED, populate the error field with a descriptive message, and log the error
**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 9: MR 去重
*For any* branch that already has an open Merge Request, the System SHALL return the existing MR URL instead of creating a duplicate
**Validates: Requirements 5.6**

### Property 10: 工具可用性验证
*For any* CODE_CHANGE Task submission, the System SHALL verify the Code Tool Provider is available before execution, and SHALL fail the task with installation instructions if unavailable
**Validates: Requirements 8.1, 8.2**

### Property 11: UI 模式显示一致性
*For any* Task displayed in the UI, the displayed mode label SHALL match the Task's TaskType (CODE_CHANGE → "编辑模式", QUERY → "只读模式")
**Validates: Requirements 7.1**

### Property 12: 进度指示器完整性
*For any* running CODE_CHANGE Task, the UI SHALL display progress indicators for all workflow steps: code modification, branch creation, commit, push, and MR creation
**Validates: Requirements 3.3, 7.2**

## Error Handling

### 错误类型
1. **工具不可用**: Code Tool Provider 未安装或配置错误
2. **Git 操作失败**: 分支创建、提交、推送失败
3. **GitLab API 失败**: MR 创建失败
4. **SSH 连接失败**: 无法连接到远程虚拟机

### 错误处理策略
- 所有错误记录到 `task.error` 字段
- 通过日志系统实时反馈给用户
- 任务状态更新为 `FAILED`
- 前端显示错误消息和失败步骤

## Testing Strategy

### 单元测试
- `Task` 模型的类型字段验证
- `TaskOrchestrator` 的类型判断逻辑
- 前端模式选择组件的状态管理

### 属性测试
使用 **fast-check** (TypeScript/JavaScript 的 PBT 库)

配置：每个属性测试运行 **100 次迭代**

测试标注格式：`**Feature: edit-mode-with-mr-workflow, Property {number}: {property_text}**`

### 集成测试
- 端到端测试：创建编辑模式任务 → 验证 MR 创建
- 端到端测试：创建只读模式任务 → 验证无代码变更
- 错误场景测试：工具不可用时的错误处理

## Implementation Notes

### 最小化改动清单
1. **后端**:
   - `Task.ts`: 添加 `type` 字段（已有 TaskType 枚举）
   - `taskRoutes.ts`: 接受 `type` 参数
   - `TaskManager.ts`: 创建任务时保存 `type`
   - `TaskOrchestrator.ts`: 根据 `type` 决定是否调用代码工具

2. **前端**:
   - `TaskInputPanel.tsx`: 添加模式选择 UI
   - `TaskList.tsx`: 显示任务类型标签
   - `TaskExecutionView.tsx`: 根据类型显示不同的进度步骤

3. **API**:
   - `POST /api/tasks`: 接受 `type` 字段（默认 `code_change`）

### 向后兼容
- 现有任务默认为 `code_change` 类型
- 未指定 `type` 的请求默认为 `code_change`
