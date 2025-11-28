# Requirements Document

## Introduction

本功能为用户提供编辑模式和只读模式的选择能力。在编辑模式下，系统将自动为代码修改创建 GitLab Merge Request，利用 GitLab 的 code review 能力进行代码审查；在只读模式下，系统维持现有行为，仅返回查询结果而不修改代码。

## Glossary

- **System**: 指代码助手系统，包括前端 UI 和后端服务
- **User**: 使用代码助手系统的开发人员
- **Edit Mode**: 编辑模式，允许 AI 通过 qodercli 修改代码并创建 MR
- **Read-Only Mode**: 只读模式，AI 仅返回信息不修改代码
- **Task**: 用户提交给 AI 的工作任务
- **MR (Merge Request)**: GitLab 的代码合并请求
- **Task Type**: 任务类型，包括 CODE_CHANGE（代码修改）和 QUERY（查询）
- **qodercli**: 代码修改工具，默认使用 neovate 实现，用于执行 AI 驱动的代码修改
- **Code Tool Provider**: 代码工具提供者，实现 ICodeToolProvider 接口的工具（如 NeovateProvider、QoderCliProvider）

## Requirements

### Requirement 1

**User Story:** 作为开发人员，我希望在提交任务前选择编辑模式或只读模式，以便控制 AI 是否可以修改代码。

#### Acceptance Criteria

1. WHEN a User creates a new Task THEN the System SHALL display a mode selection interface with Edit Mode and Read-Only Mode options
2. WHEN a User selects Edit Mode THEN the System SHALL set the Task Type to CODE_CHANGE
3. WHEN a User selects Read-Only Mode THEN the System SHALL set the Task Type to QUERY
4. WHEN a User submits a Task THEN the System SHALL persist the selected mode with the Task
5. WHEN the mode selection interface is displayed THEN the System SHALL provide clear descriptions for each mode option

### Requirement 2

**User Story:** 作为开发人员，我希望在编辑模式下系统通过 qodercli 修改代码并自动创建 MR，以便利用 GitLab 的 code review 流程。

#### Acceptance Criteria

1. WHEN a Task with Task Type CODE_CHANGE is executed THEN the System SHALL invoke the configured Code Tool Provider to modify code
2. WHEN the Code Tool Provider completes code modification THEN the System SHALL create a new branch for the code changes
3. WHEN the System creates a new branch THEN the System SHALL commit all code changes to that branch
4. WHEN code changes are committed THEN the System SHALL push the branch to the remote repository
5. WHEN the branch is pushed THEN the System SHALL create a Merge Request via GitLab API
6. WHEN a Merge Request is created THEN the System SHALL include the Task prompt in the MR title and description

### Requirement 3

**User Story:** 作为开发人员，我希望在 MR 创建后立即看到 MR 链接，以便快速访问进行 code review。

#### Acceptance Criteria

1. WHEN a Merge Request is created successfully THEN the System SHALL display the MR web URL to the User
2. WHEN the MR URL is displayed THEN the System SHALL make it clickable for direct navigation
3. WHEN a Task with Task Type CODE_CHANGE is in progress THEN the System SHALL show status updates including branch creation and MR creation steps
4. WHEN MR creation fails THEN the System SHALL display a clear error message with failure reason
5. WHEN a User views a completed CODE_CHANGE Task THEN the System SHALL persist and display the MR URL

### Requirement 4

**User Story:** 作为开发人员，我希望在只读模式下系统不修改任何代码，以便安全地查询信息。

#### Acceptance Criteria

1. WHEN a Task with Task Type QUERY is executed THEN the System SHALL not invoke the Code Tool Provider
2. WHEN a Task with Task Type QUERY is executed THEN the System SHALL not create any branches
3. WHEN a Task with Task Type QUERY is executed THEN the System SHALL not commit any code changes
4. WHEN a Task with Task Type QUERY is executed THEN the System SHALL not create any Merge Requests
5. WHEN a Task with Task Type QUERY completes THEN the System SHALL return the query result to the User
6. WHEN a Task with Task Type QUERY is in progress THEN the System SHALL display status updates indicating read-only execution

### Requirement 5

**User Story:** 作为开发人员，我希望系统能够处理 MR 创建过程中的各种错误情况，以便了解失败原因并采取相应措施。

#### Acceptance Criteria

1. WHEN Code Tool Provider execution fails THEN the System SHALL log the error and notify the User with the tool error details
2. WHEN branch creation fails THEN the System SHALL log the error and notify the User with a descriptive message
3. WHEN code commit fails THEN the System SHALL log the error and notify the User with a descriptive message
4. WHEN branch push fails THEN the System SHALL log the error and notify the User with a descriptive message
5. WHEN MR creation via GitLab API fails THEN the System SHALL log the error and notify the User with the API error details
6. WHEN a Merge Request already exists for the source branch THEN the System SHALL return the existing MR URL instead of creating a duplicate

### Requirement 6

**User Story:** 作为开发人员，我希望系统能够生成有意义的分支名称和 MR 标题，以便于识别和管理。

#### Acceptance Criteria

1. WHEN the System creates a branch for a CODE_CHANGE Task THEN the System SHALL generate a branch name containing the Task ID
2. WHEN the System creates a branch name THEN the System SHALL ensure the name follows Git branch naming conventions
3. WHEN the System creates a Merge Request THEN the System SHALL generate a title based on the Task prompt
4. WHEN the System generates an MR title THEN the System SHALL limit the title length to 255 characters
5. WHEN the System creates a Merge Request THEN the System SHALL include the Task ID in the MR description

### Requirement 7

**User Story:** 作为开发人员，我希望前端 UI 能够清晰展示任务的执行模式和状态，以便了解任务的执行方式和进度。

#### Acceptance Criteria

1. WHEN a User views the Task list THEN the System SHALL display the mode (Edit or Read-Only) for each Task
2. WHEN a CODE_CHANGE Task is running THEN the System SHALL display progress indicators for code modification, branch creation, commit, push, and MR creation steps
3. WHEN a CODE_CHANGE Task completes successfully THEN the System SHALL display the MR URL prominently
4. WHEN a QUERY Task completes successfully THEN the System SHALL display the query result
5. WHEN a Task fails THEN the System SHALL display the error message and the step at which failure occurred

### Requirement 8

**User Story:** 作为开发人员，我希望系统能够验证代码工具的可用性，以便在执行前确保工具已正确配置。

#### Acceptance Criteria

1. WHEN a CODE_CHANGE Task is submitted THEN the System SHALL verify the Code Tool Provider is available before execution
2. WHEN the Code Tool Provider is not available THEN the System SHALL notify the User with installation instructions
3. WHEN the System starts THEN the System SHALL log the configured Code Tool Provider name and version
4. WHEN Code Tool Provider configuration is invalid THEN the System SHALL prevent Task execution and display configuration errors
5. WHEN a User requests tool information THEN the System SHALL display the current Code Tool Provider name, version, and availability status
