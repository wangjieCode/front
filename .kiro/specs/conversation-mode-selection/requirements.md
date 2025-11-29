# Requirements Document

## Introduction

本需求文档定义了对话模式选择功能。用户在创建对话时可以选择两种模式：编辑模式（会创建 Git 分支和 MR）和只读模式（仅查询信息，不修改代码）。

## Glossary

- **System**: 前端小秘对话系统
- **User**: 使用系统的开发者
- **Conversation**: 用户与 AI 助手之间的对话会话
- **Edit Mode**: 编辑模式，允许 AI 修改代码并创建 Git 分支和 MR
- **Read-only Mode**: 只读模式，AI 只能查询和分析代码，不能修改
- **Git Branch**: Git 版本控制分支
- **MR (Merge Request)**: 代码合并请求

## Requirements

### Requirement 1

**User Story:** 作为开发者，我想在创建对话时选择模式，以便控制 AI 是否可以修改代码。

#### Acceptance Criteria

1. WHEN 用户访问对话创建界面 THEN System SHALL 显示模式选择选项（编辑模式和只读模式）
2. WHEN 用户选择编辑模式 THEN System SHALL 在对话会话中记录 mode 为 'edit'
3. WHEN 用户选择只读模式 THEN System SHALL 在对话会话中记录 mode 为 'readonly'
4. WHEN 用户未选择模式 THEN System SHALL 默认使用编辑模式
5. WHEN 对话会话创建成功 THEN System SHALL 在会话上下文中保存选择的模式

### Requirement 2

**User Story:** 作为开发者，我想在编辑模式下让 AI 创建分支和 MR，以便代码变更可以被审查。

#### Acceptance Criteria

1. WHEN 对话处于编辑模式且 AI 需要修改代码 THEN System SHALL 创建新的 Git 分支
2. WHEN 代码修改完成 THEN System SHALL 创建 Merge Request
3. WHEN 分支创建成功 THEN System SHALL 在消息元数据中记录分支名称
4. WHEN MR 创建成功 THEN System SHALL 在消息元数据中记录 MR URL
5. WHEN Git 操作失败 THEN System SHALL 记录错误信息并通知用户

### Requirement 3

**User Story:** 作为开发者，我想在只读模式下让 AI 只查询代码，以便快速获取信息而不担心代码被修改。

#### Acceptance Criteria

1. WHEN 对话处于只读模式且 AI 尝试修改代码 THEN System SHALL 拒绝该操作
2. WHEN 对话处于只读模式 THEN System SHALL 允许 AI 使用查询类工具（如读取文件、搜索代码）
3. WHEN 对话处于只读模式 THEN System SHALL 不创建 Git 分支
4. WHEN 对话处于只读模式 THEN System SHALL 不创建 Merge Request
5. WHEN AI 在只读模式下尝试修改代码 THEN System SHALL 返回友好的错误提示

### Requirement 4

**User Story:** 作为开发者，我想在对话界面中看到当前模式，以便知道 AI 的操作权限。

#### Acceptance Criteria

1. WHEN 用户查看对话界面 THEN System SHALL 显示当前对话的模式（编辑或只读）
2. WHEN 对话处于编辑模式 THEN System SHALL 显示编辑模式图标和标签
3. WHEN 对话处于只读模式 THEN System SHALL 显示只读模式图标和标签
4. WHEN 用户悬停在模式标签上 THEN System SHALL 显示模式说明的提示信息
5. WHEN 对话列表显示历史对话 THEN System SHALL 在每个对话项上显示其模式

### Requirement 5

**User Story:** 作为开发者，我想在对话创建后无法更改模式，以便保持对话的一致性和可追溯性。

#### Acceptance Criteria

1. WHEN 对话会话已创建 THEN System SHALL 不允许修改对话模式
2. WHEN 用户尝试更改已创建对话的模式 THEN System SHALL 显示错误提示
3. WHEN 用户需要不同模式 THEN System SHALL 提示用户创建新对话
4. WHEN 对话模式被保存 THEN System SHALL 确保该模式在整个对话生命周期中保持不变
5. WHEN 对话被加载 THEN System SHALL 正确恢复保存的模式设置
