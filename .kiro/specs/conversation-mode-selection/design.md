# Design Document

## Overview

本设计文档描述了对话模式选择功能的实现方案。该功能允许用户在创建对话时选择编辑模式或只读模式，从而控制 AI 是否可以修改代码。

## Architecture

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Mode Selector   │────────▶│  Conversation    │         │
│  │  Component       │         │  Service         │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Backend                               │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Conversation    │────────▶│  Mode Validator  │         │
│  │  Manager         │         │                  │         │
│  └──────────────────┘         └──────────────────┘         │
│           │                            │                     │
│           ▼                            ▼                     │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Git Service     │         │  Code Tool       │         │
│  │  (Edit Mode)     │         │  Service         │         │
│  └──────────────────┘         └──────────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 核心流程

1. **对话创建流程**
   - 用户选择模式 → 前端发送创建请求 → 后端保存模式到会话上下文
   
2. **编辑模式流程**
   - AI 修改代码 → 创建 Git 分支 → 提交代码 → 创建 MR → 返回结果
   
3. **只读模式流程**
   - AI 查询代码 → 验证操作权限 → 执行查询 → 返回结果

## Components and Interfaces

### 1. 前端组件

#### ModeSelector 组件

```typescript
interface ModeSelectorProps {
  value: ConversationMode;
  onChange: (mode: ConversationMode) => void;
  disabled?: boolean;
}

// 模式选择器组件
const ModeSelector: React.FC<ModeSelectorProps> = ({ value, onChange, disabled }) => {
  // 渲染编辑模式和只读模式的选项
  // 显示每个模式的图标、名称和说明
};
```

#### ConversationView 组件更新

```typescript
// 在对话视图中显示当前模式
interface ConversationViewProps {
  sessionId: string;
  mode: ConversationMode;  // 新增：显示当前模式
  onClose: () => void;
}
```

### 2. 后端服务

#### ConversationManager 更新

```typescript
class ConversationManager {
  /**
   * 创建新的对话会话（支持模式参数）
   */
  async createSession(
    taskId: string,
    initialPrompt: string,
    projectInfo: ProjectInfo,
    mode: ConversationMode = 'edit'  // 新增：模式参数
  ): Promise<ConversationSession>;
  
  /**
   * 验证操作是否允许
   */
  async validateOperation(
    sessionId: string,
    operation: OperationType
  ): Promise<boolean>;
}
```

#### ModeValidator 服务

```typescript
class ModeValidator {
  /**
   * 验证操作是否在当前模式下允许
   */
  validateOperation(
    mode: ConversationMode,
    operation: OperationType
  ): ValidationResult;
  
  /**
   * 获取模式允许的操作列表
   */
  getAllowedOperations(mode: ConversationMode): OperationType[];
}
```

#### GitService 更新

```typescript
class GitService {
  /**
   * 为编辑模式创建分支
   */
  async createBranchForConversation(
    sessionId: string,
    baseBranch: string
  ): Promise<string>;
  
  /**
   * 创建 Merge Request
   */
  async createMergeRequest(
    sourceBranch: string,
    targetBranch: string,
    title: string,
    description: string
  ): Promise<MergeRequestInfo>;
}
```

## Data Models

### ConversationMode 枚举

```typescript
export enum ConversationMode {
  EDIT = 'edit',        // 编辑模式
  READONLY = 'readonly' // 只读模式
}
```

### OperationType 枚举

```typescript
export enum OperationType {
  READ_FILE = 'read_file',           // 读取文件
  SEARCH_CODE = 'search_code',       // 搜索代码
  MODIFY_CODE = 'modify_code',       // 修改代码
  CREATE_FILE = 'create_file',       // 创建文件
  DELETE_FILE = 'delete_file',       // 删除文件
  CREATE_BRANCH = 'create_branch',   // 创建分支
  CREATE_MR = 'create_mr'            // 创建 MR
}
```

### ConversationContext 更新

```typescript
export interface ConversationContext {
  projectInfo: ProjectInfo;
  taskDescription: string;
  messageHistory: string[];
  currentBranchId: string;
  branches: ConversationBranch[];
  variables: Record<string, any>;
  mode: ConversationMode;  // 新增：对话模式
  gitBranch?: string;      // 新增：编辑模式下创建的 Git 分支
  mrUrl?: string;          // 新增：编辑模式下创建的 MR URL
}
```

### MessageMetadata 更新

```typescript
export interface MessageMetadata {
  toolCalls?: ToolCall[];
  codeChanges?: CodeChange[];
  thinking?: string;
  isQuestion?: boolean;
  questionOptions?: string[];
  requiresResponse?: boolean;
  references?: string[];
  isInvalid?: boolean;
  gitBranch?: string;      // 新增：关联的 Git 分支
  mrUrl?: string;          // 新增：关联的 MR URL
  operationDenied?: {      // 新增：操作被拒绝的信息
    operation: OperationType;
    reason: string;
  };
}
```

### ValidationResult 接口

```typescript
export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}
```

### MergeRequestInfo 接口

```typescript
export interface MergeRequestInfo {
  mrId: number;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
}
```

## Cor
rectness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Mode persistence

*For any* conversation session and mode selection (edit or readonly), when a mode is set during session creation, the saved session context should contain that exact mode value.
**Validates: Requirements 1.2, 1.3**

### Property 2: Mode round-trip consistency

*For any* conversation session with a mode, saving and then loading the session should preserve the mode value unchanged.
**Validates: Requirements 1.5, 5.5**

### Property 3: Edit mode enables Git operations

*For any* conversation session in edit mode, when a code modification operation is performed, the system should create a Git branch and the branch name should be recorded in the message metadata.
**Validates: Requirements 2.1, 2.3**

### Property 4: Edit mode creates MR

*For any* conversation session in edit mode, when code modifications are completed, the system should create a Merge Request and the MR URL should be recorded in the message metadata.
**Validates: Requirements 2.2, 2.4**

### Property 5: Readonly mode blocks modifications

*For any* conversation session in readonly mode, when any code modification operation (modify_code, create_file, delete_file) is attempted, the system should reject the operation and return a validation error.
**Validates: Requirements 3.1, 3.5**

### Property 6: Readonly mode allows queries

*For any* conversation session in readonly mode, when any query operation (read_file, search_code) is attempted, the system should allow the operation and return results.
**Validates: Requirements 3.2**

### Property 7: Readonly mode prevents Git operations

*For any* conversation session in readonly mode, the system should not create Git branches or Merge Requests regardless of the operations performed.
**Validates: Requirements 3.3, 3.4**

### Property 8: Mode immutability

*For any* conversation session that has been created, any attempt to modify the mode should fail and the mode should remain unchanged throughout the session lifecycle.
**Validates: Requirements 5.1, 5.2, 5.4**

### Property 9: Error handling completeness

*For any* Git operation failure in edit mode, the system should record error information in the session and include the error in the response to the user.
**Validates: Requirements 2.5**

### Property 10: Mode display consistency

*For any* conversation list containing multiple sessions, each session item should display its mode information.
**Validates: Requirements 4.5**

## Error Handling

### 模式验证错误

- **错误场景**: 只读模式下尝试修改代码
- **处理方式**: 返回 `ValidationError`，包含友好的错误消息
- **用户反馈**: "当前对话处于只读模式，无法修改代码。如需修改代码，请创建新的编辑模式对话。"

### Git 操作错误

- **错误场景**: 编辑模式下 Git 分支创建失败
- **处理方式**: 记录错误到会话，回滚代码修改
- **用户反馈**: "创建 Git 分支失败：[错误详情]。请检查 Git 配置或联系管理员。"

### MR 创建错误

- **错误场景**: 编辑模式下 MR 创建失败
- **处理方式**: 记录错误到会话，保留已创建的分支
- **用户反馈**: "代码已提交到分支 [分支名]，但创建 MR 失败：[错误详情]。你可以手动创建 MR。"

### 模式修改错误

- **错误场景**: 尝试修改已创建会话的模式
- **处理方式**: 返回 `ImmutableFieldError`
- **用户反馈**: "对话模式在创建后无法修改。如需使用不同模式，请创建新对话。"

## Testing Strategy

### 单元测试

1. **ModeValidator 测试**
   - 测试各种操作在不同模式下的验证结果
   - 测试边界情况（未知操作类型、未知模式）

2. **ConversationManager 测试**
   - 测试创建会话时模式的保存
   - 测试模式的默认值
   - 测试模式修改被拒绝

3. **GitService 测试**
   - 测试编辑模式下分支创建
   - 测试 MR 创建
   - 测试错误处理

4. **前端组件测试**
   - 测试 ModeSelector 组件渲染
   - 测试模式选择交互
   - 测试模式显示

### 属性测试

使用 **fast-check** (TypeScript/JavaScript 的属性测试库) 进行属性测试。每个属性测试应运行至少 100 次迭代。

1. **Property 1: Mode persistence**
   - 生成随机的会话数据和模式
   - 创建会话并验证模式被正确保存

2. **Property 2: Mode round-trip consistency**
   - 生成随机的会话数据
   - 保存并加载会话，验证模式不变

3. **Property 3-4: Edit mode Git operations**
   - 生成随机的编辑模式会话
   - 执行代码修改操作
   - 验证 Git 分支和 MR 被创建

4. **Property 5-7: Readonly mode restrictions**
   - 生成随机的只读模式会话
   - 尝试各种操作
   - 验证修改被拒绝，查询被允许

5. **Property 8: Mode immutability**
   - 生成随机的会话
   - 尝试修改模式
   - 验证模式保持不变

6. **Property 9: Error handling**
   - 模拟 Git 操作失败
   - 验证错误被正确记录和返回

7. **Property 10: Mode display**
   - 生成随机的会话列表
   - 验证每个会话都显示模式信息

### 集成测试

1. **完整的编辑模式流程**
   - 创建编辑模式对话
   - 发送代码修改请求
   - 验证分支和 MR 被创建
   - 验证元数据被正确记录

2. **完整的只读模式流程**
   - 创建只读模式对话
   - 发送查询请求（应成功）
   - 发送修改请求（应失败）
   - 验证错误消息

3. **模式持久化测试**
   - 创建不同模式的对话
   - 重启服务
   - 验证模式被正确恢复

## Implementation Notes

### 前端实现要点

1. **模式选择器位置**: 放在对话创建界面的输入框上方，使用 Radio 或 Segmented 组件
2. **模式图标**: 编辑模式使用 `EditOutlined`，只读模式使用 `EyeOutlined`
3. **模式显示**: 在对话标题栏显示当前模式的徽章
4. **历史对话**: 在侧边栏对话列表中显示模式图标

### 后端实现要点

1. **数据库迁移**: 需要在 `conversation_contexts` 表中添加 `mode` 字段
2. **向后兼容**: 对于没有 mode 字段的旧会话，默认为 'edit' 模式
3. **验证中间件**: 在代码工具服务调用前添加模式验证
4. **Git 服务集成**: 只在编辑模式下初始化 GitService

### 性能考虑

1. **模式验证**: 验证操作应该是轻量级的，不应该影响响应时间
2. **Git 操作**: 分支创建和 MR 创建应该异步执行，不阻塞用户消息
3. **缓存**: 会话的模式信息应该被缓存，避免重复查询数据库

### 安全考虑

1. **权限验证**: 确保只读模式下无法绕过验证执行修改操作
2. **审计日志**: 记录所有被拒绝的操作尝试
3. **输入验证**: 验证模式参数只能是 'edit' 或 'readonly'
