## 项目管理与对话系统集成方案

### 核心目标
将已有的项目管理功能集成到对话核心功能中，支持：
1. 选择项目进行对话
2. 基于项目的MR创建、分支创建、worktree创建
3. 项目权限控制和安全验证

### 关键发现

#### 1. 现有架构分析
- **ProjectService**: 完整的项目CRUD、成员管理、权限控制(OWNER/ADMIN/MEMBER)
- **ConversationManager**: 接收ProjectInfo，当前使用环境变量构建workDir
- **WorktreeManager**: 基于用户ID创建worktree，与GitService集成
- **数据库**: projects表 + project_members表，支持多对多关系

#### 2. 核心问题
- 对话系统使用固定GIT_WORK_DIR，无法支持多项目
- 缺少项目选择和权限验证机制
- WorktreeManager基于用户ID而非项目ID管理

### 集成方案

#### 阶段一：核心接口扩展
1. **扩展ProjectInfo接口**
   - 添加projectId、gitRepositoryUrl、gitlabProjectId字段
   - 保持向后兼容性

2. **修改对话创建流程**
   - conversationRoutes.ts添加projectId参数支持
   - 集成项目权限验证
   - 使用项目信息构建ProjectInfo

#### 阶段二：WorktreeManager增强
1. **支持项目维度worktree**
   - 路径结构：worktreeBaseDir/project-{projectId}/user-{userId}
   - 保持现有用户维度兼容性

2. **ConversationManager集成**
   - 处理项目上下文
   - 传递项目信息到WorktreeManager

#### 阶段三：前端集成
1. **对话创建页面**
   - 添加项目选择器
   - 权限验证和项目过滤
   - 集成到现有对话流程

2. **服务层更新**
   - conversationService支持projectId
   - 项目权限前端验证

#### 阶段四：Git操作优化
1. **GitService项目配置**
   - 使用项目特定的GitLab配置
   - MR创建时使用项目gitlabProjectId

2. **RepositoryService集成**
   - 项目维度的仓库管理
   - 异步克隆优化

### 关键文件

#### 后端核心文件
1. **src/types/index.ts** - ProjectInfo接口扩展
2. **src/api/conversationRoutes.ts** - 对话创建逻辑
3. **src/services/ConversationManager.ts** - 对话管理核心
4. **src/services/WorktreeManager.ts** - worktree管理
5. **src/services/ProjectService.ts** - 项目权限验证

#### 前端核心文件
1. **src/pages/ConversationPage.tsx** - 对话创建页面
2. **src/services/conversationService.ts** - 对话服务
3. **src/pages/ProjectsPage.tsx** - 项目选择集成

### 实施优先级

#### 高优先级
- ProjectInfo接口扩展
- conversationRoutes.ts项目参数支持
- ConversationManager项目上下文处理
- WorktreeManager项目维度支持

#### 中优先级
- 前端项目选择功能
- GitService项目配置
- 项目权限验证中间件

#### 低优先级
- 性能优化和测试
- 错误处理完善
- 文档更新

### 技术优势
1. **向后兼容** - 保持现有API兼容性
2. **权限安全** - 基于现有项目权限体系
3. **架构清晰** - 项目上下文贯穿整个对话流程
4. **扩展性强** - 为未来多项目协作奠定基础

### 预期效果
- 用户可以选择特定项目进行对话
- 自动处理项目相关的Git操作
- 完整的权限控制和安全验证
- 支持多项目并行协作

这个方案将项目管理无缝集成到对话核心功能中，提供完整的项目协作体验。
