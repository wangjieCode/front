# Implementation Plan

- [x] 1. 更新数据模型和类型定义
  - 在后端 types/index.ts 中添加 ConversationMode 和 OperationType 枚举
  - 更新 ConversationContext 接口，添加 mode、gitBranch、mrUrl 字段
  - 更新 MessageMetadata 接口，添加 gitBranch、mrUrl、operationDenied 字段
  - 在前端 types/conversation.ts 中同步类型定义
  - _Requirements: 1.2, 1.3, 1.5, 2.3, 2.4, 3.5_

- [ ]* 1.1 编写属性测试：模式持久化
  - **Property 1: Mode persistence**
  - **Validates: Requirements 1.2, 1.3**

- [x] 2. 实现后端模式验证服务
  - 创建 ModeValidator 类，实现操作验证逻辑
  - 实现 validateOperation 方法，根据模式验证操作是否允许
  - 实现 getAllowedOperations 方法，返回模式允许的操作列表
  - 定义编辑模式和只读模式的操作权限映射
  - _Requirements: 3.1, 3.2, 3.5_

- [ ]* 2.1 编写属性测试：只读模式阻止修改
  - **Property 5: Readonly mode blocks modifications**
  - **Validates: Requirements 3.1, 3.5**

- [ ]* 2.2 编写属性测试：只读模式允许查询
  - **Property 6: Readonly mode allows queries**
  - **Validates: Requirements 3.2**

- [ ]* 2.3 编写单元测试：ModeValidator
  - 测试各种操作在不同模式下的验证结果
  - 测试边界情况（未知操作类型、未知模式）

- [x] 3. 更新 ConversationManager 支持模式
  - 修改 createSession 方法，添加 mode 参数，默认值为 'edit'
  - 在创建会话时将 mode 保存到 context 中
  - 实现 validateOperation 方法，调用 ModeValidator 验证操作
  - 添加模式不可变性检查，防止修改已创建会话的模式
  - _Requirements: 1.2, 1.3, 1.4, 1.5, 5.1, 5.2, 5.4_

- [ ]* 3.1 编写属性测试：模式 round-trip 一致性
  - **Property 2: Mode round-trip consistency**
  - **Validates: Requirements 1.5, 5.5**

- [ ]* 3.2 编写属性测试：模式不可变性
  - **Property 8: Mode immutability**
  - **Validates: Requirements 5.1, 5.2, 5.4**

- [ ]* 3.3 编写单元测试：ConversationManager 模式功能
  - 测试创建会话时模式的保存
  - 测试模式的默认值
  - 测试模式修改被拒绝

- [x] 4. 更新数据库 schema 和迁移
  - 在 conversation_contexts 表中添加 mode 字段（VARCHAR，默认 'edit'）
  - 在 conversation_contexts 表中添加 git_branch 字段（VARCHAR，可选）
  - 在 conversation_contexts 表中添加 mr_url 字段（VARCHAR，可选）
  - 创建数据库迁移脚本
  - 运行迁移，更新现有数据
  - _Requirements: 1.5, 2.3, 2.4_

- [x] 5. 实现 GitService 集成
  - 创建 GitService 类（如果不存在）
  - 实现 createBranchForConversation 方法，为对话创建 Git 分支
  - 实现 createMergeRequest 方法，创建 MR
  - 添加错误处理，记录 Git 操作失败的详细信息
  - 在 ConversationManager 中集成 GitService，仅在编辑模式下调用
  - _Requirements: 2.1, 2.2, 2.5_

- [ ]* 5.1 编写属性测试：编辑模式启用 Git 操作
  - **Property 3: Edit mode enables Git operations**
  - **Validates: Requirements 2.1, 2.3**

- [ ]* 5.2 编写属性测试：编辑模式创建 MR
  - **Property 4: Edit mode creates MR**
  - **Validates: Requirements 2.2, 2.4**

- [ ]* 5.3 编写属性测试：只读模式阻止 Git 操作
  - **Property 7: Readonly mode prevents Git operations**
  - **Validates: Requirements 3.3, 3.4**

- [ ]* 5.4 编写属性测试：错误处理完整性
  - **Property 9: Error handling completeness**
  - **Validates: Requirements 2.5**

- [ ]* 5.5 编写单元测试：GitService
  - 测试编辑模式下分支创建
  - 测试 MR 创建
  - 测试错误处理

- [x] 6. 更新对话 API 路由
  - 修改 POST /api/conversations 路由，接收 mode 参数
  - 在创建会话时传递 mode 参数给 ConversationManager
  - 在 POST /api/conversations/:sessionId/messages 路由中添加模式验证
  - 在执行代码修改前调用 validateOperation 验证权限
  - 返回友好的错误消息当操作被拒绝时
  - _Requirements: 1.2, 1.3, 3.1, 3.5_

- [ ] 7. 更新 ConversationAIService 支持模式
  - 在 generateResponse 方法中检查会话模式
  - 在编辑模式下，允许 AI 使用代码修改工具
  - 在只读模式下，限制 AI 只能使用查询工具
  - 当 AI 尝试在只读模式下修改代码时，返回友好的错误提示
  - _Requirements: 3.1, 3.2, 3.5_

- [x] 8. 创建前端 ModeSelector 组件
  - 创建 ModeSelector.tsx 组件
  - 使用 Ant Design 的 Segmented 或 Radio 组件
  - 显示编辑模式和只读模式选项
  - 为每个模式添加图标（EditOutlined / EyeOutlined）
  - 添加模式说明的 Tooltip
  - 支持 disabled 属性
  - _Requirements: 1.1, 4.2, 4.3, 4.4_

- [ ]* 8.1 编写单元测试：ModeSelector 组件
  - 测试组件渲染
  - 测试模式选择交互
  - 测试 disabled 状态

- [x] 9. 更新前端对话创建界面
  - 在 App.tsx 的对话创建界面中添加 ModeSelector 组件
  - 添加 mode 状态管理
  - 在提交时将 mode 参数传递给 API
  - 设置默认模式为编辑模式
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 10. 更新前端 ConversationView 组件
  - 在对话标题栏显示当前模式的徽章（Badge）
  - 根据模式显示不同的图标和颜色
  - 添加模式说明的 Tooltip
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ]* 10.1 编写单元测试：ConversationView 模式显示
  - 测试编辑模式显示
  - 测试只读模式显示

- [x] 11. 更新前端对话列表
  - 在 App.tsx 的对话列表中为每个对话项添加模式图标
  - 使用小图标或徽章显示模式
  - 添加 Tooltip 说明模式
  - _Requirements: 4.5_

- [ ]* 11.1 编写属性测试：模式显示一致性
  - **Property 10: Mode display consistency**
  - **Validates: Requirements 4.5**

- [x] 12. 更新前端 conversationService
  - 修改 createConversation 方法，添加 mode 参数
  - 更新 TypeScript 类型定义
  - _Requirements: 1.2, 1.3_

- [x] 13. 实现错误处理和用户反馈
  - 在后端添加自定义错误类（ValidationError, ImmutableFieldError）
  - 在前端添加错误消息显示
  - 为不同的错误场景提供友好的错误消息
  - 在只读模式被拒绝时，提示用户创建新的编辑模式对话
  - _Requirements: 2.5, 3.5, 5.2_

- [x] 14. Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户

- [ ]* 15. 编写集成测试
  - 测试完整的编辑模式流程（创建对话 → 修改代码 → 创建分支和 MR）
  - 测试完整的只读模式流程（创建对话 → 查询成功 → 修改失败）
  - 测试模式持久化（创建对话 → 重启服务 → 验证模式恢复）

- [ ] 16. 更新文档
  - 更新 API 文档，说明 mode 参数
  - 更新用户指南，说明两种模式的区别和使用场景
  - 添加迁移指南，说明如何从旧版本升级
  - _Requirements: All_
