# Implementation Plan

- [x] 1. 扩展 Task 模型支持任务类型
  - 在 Task 接口添加 `type: TaskType` 字段
  - 更新 Task 创建逻辑以接受和保存 type 参数
  - 设置默认值为 `code_change` 以保持向后兼容
  - _Requirements: 1.2, 1.3, 1.4_

- [ ]* 1.1 为 Task 模型编写属性测试
  - **Property 1: 模式选择持久化**
  - **Validates: Requirements 1.4**

- [x] 2. 更新后端 API 接受任务类型
  - 修改 `POST /api/tasks` 路由接受 `type` 参数
  - 在 TaskManager.createTask() 中保存任务类型
  - 添加类型验证（仅允许 'code_change' 或 'query'）
  - _Requirements: 1.2, 1.3, 1.4_

- [x] 3. 实现 TaskOrchestrator 的类型判断逻辑
  - 在 executeTask() 开始处检查任务类型
  - 对于 QUERY 类型：跳过代码工具调用，直接保存提示词作为结果
  - 对于 CODE_CHANGE 类型：保持现有流程（调用代码工具 → 检查变更 → 创建 MR）
  - 添加工具可用性检查（仅 CODE_CHANGE 类型）
  - _Requirements: 2.1, 4.1, 4.5, 8.1_

- [ ]* 3.1 为编辑模式工作流编写属性测试
  - **Property 2: 编辑模式完整工作流**
  - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

- [ ]* 3.2 为只读模式编写属性测试
  - **Property 3: 只读模式无副作用**
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [ ]* 3.3 为查询结果返回编写属性测试
  - **Property 4: 查询结果返回**
  - **Validates: Requirements 4.5**

- [ ]* 3.4 为工具可用性验证编写属性测试
  - **Property 10: 工具可用性验证**
  - **Validates: Requirements 8.1, 8.2**

- [x] 4. 前端：创建模式选择组件
  - 在 TaskInputPanel 添加模式选择 UI（单选按钮或下拉菜单）
  - 提供两个选项：编辑模式（code_change）和只读模式（query）
  - 为每个选项添加清晰的描述文本
  - 管理选中状态并在提交时传递给 API
  - _Requirements: 1.1, 1.2, 1.3, 1.5_

- [x] 5. 前端：在任务列表显示任务类型
  - 在 TaskList 组件为每个任务添加类型标签
  - CODE_CHANGE 显示"编辑模式"标签（如绿色）
  - QUERY 显示"只读模式"标签（如蓝色）
  - _Requirements: 7.1_

- [ ]* 5.1 为 UI 模式显示编写属性测试
  - **Property 11: UI 模式显示一致性**
  - **Validates: Requirements 7.1**

- [x] 6. 前端：优化任务执行视图
  - 在 TaskExecutionView 根据任务类型显示不同的进度步骤
  - CODE_CHANGE 类型：显示"代码修改 → 创建分支 → 提交 → 推送 → 创建 MR"
  - QUERY 类型：显示"查询中 → 返回结果"
  - 对于 CODE_CHANGE 任务，突出显示 MR URL（可点击链接）
  - 对于 QUERY 任务，显示查询结果内容
  - _Requirements: 3.1, 3.2, 3.3, 7.2, 7.3, 7.4_

- [ ]* 6.1 为进度指示器编写属性测试
  - **Property 12: 进度指示器完整性**
  - **Validates: Requirements 3.3, 7.2**

- [x] 7. 增强错误处理和日志
  - 在 TaskOrchestrator 为工具不可用场景添加错误处理
  - 为 QUERY 类型任务添加专门的日志消息
  - 确保所有错误都记录到 task.error 字段
  - 在前端显示错误消息和失败步骤
  - _Requirements: 5.1, 5.2, 7.5, 8.2_

- [ ]* 7.1 为错误处理编写属性测试
  - **Property 8: 错误处理完整性**
  - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [ ] 8. 验证 MR 创建逻辑
  - 确认 GitLabMCPService.createMRForTask() 正确生成标题和描述
  - 验证 MR 标题包含任务提示词且不超过 255 字符
  - 验证 MR 描述包含任务 ID
  - 验证分支名称包含任务 ID 并符合 Git 规范
  - _Requirements: 2.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 8.1 为 MR 内容完整性编写属性测试
  - **Property 5: MR 内容完整性**
  - **Validates: Requirements 2.6, 6.3, 6.4, 6.5**

- [ ]* 8.2 为分支命名规范编写属性测试
  - **Property 6: 分支命名规范**
  - **Validates: Requirements 6.1, 6.2**

- [ ]* 8.3 为 MR URL 持久化编写属性测试
  - **Property 7: MR URL 持久化**
  - **Validates: Requirements 3.1, 3.5**

- [ ]* 8.4 为 MR 去重编写属性测试
  - **Property 9: MR 去重**
  - **Validates: Requirements 5.6**

- [ ] 9. Checkpoint - 确保所有测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. 端到端测试和文档更新
  - 手动测试编辑模式：创建任务 → 验证 MR 创建 → 检查 MR 内容
  - 手动测试只读模式：创建任务 → 验证无代码变更 → 检查返回结果
  - 测试错误场景：工具不可用、Git 操作失败等
  - 更新 README.md 说明新的模式选择功能
  - _Requirements: All_
