# 文档索引

本目录包含对话系统的所有技术文档。

---

## 🎉 [完整工作总结](./WORK_SUMMARY.md) ⭐ 必读

**对话状态简化项目完整总结** - 包含所有已完成的工作、改进对比、文件清单和后续步骤。

---

## 📚 核心架构文档

### 1. [对话逻辑链路](./conversation_logic.md)

- **描述**: 对话系统的前后端逻辑链路
- **内容**: 会话创建、消息交互、Git 集成、状态管理
- **适用**: 了解整体架构和流程

### 2. [Neovate 交互流程](./neovate_interaction_flow.md)

- **描述**: NeovateAIService 的详细交互流程
- **内容**: 消息处理、AI 调用、会话管理、数据库表关系
- **适用**: 了解 AI 服务的工作原理

### 3. [对话状态管理（简化版）](./conversation_state_management_simplified.md) ⭐ 最新

- **描述**: 简化后的对话状态机制（ACTIVE/ARCHIVED）
- **内容**:
  - 2 种对话状态：ACTIVE（活跃中）、ARCHIVED（已归档）
  - 状态转换规则
  - 归档和恢复对话
  - Worktree 清理机制
- **适用**: 了解当前的对话状态管理

### 4. ~~[对话状态管理（旧版）](./conversation_state_management.md)~~ 已废弃

- **描述**: 旧的复杂状态模型（5 种状态）
- **状态**: 已废弃，仅供参考

---

## 🌳 Worktree 架构文档（优化版）

### 5. [Worktree 和分支关系梳理](./worktree_branch_relationship.md) ⭐ 核心

- **描述**: 优化后的 Worktree 架构详细说明
- **内容**:
  - 新旧架构对比
  - 每对话独立 worktree 的设计
  - 创建流程详解
  - API 变更说明
  - 常见问题解答
- **适用**: 了解当前 Worktree 架构

### 6. [Worktree 架构优化总结](./worktree_optimization_summary.md)

- **描述**: 架构优化的总结和对比
- **内容**:
  - 优化目标和动机
  - 新旧架构对比表
  - 代码变更清单
  - 性能对比
  - 优势和注意事项
- **适用**: 快速了解优化内容

### 7. [Worktree 迁移指南](./worktree_migration_guide.md)

- **描述**: 从旧架构迁移到新架构的指南
- **内容**:
  - 代码变更清单
  - 迁移步骤
  - 测试清单
  - 回滚方案
  - 兼容性说明
- **适用**: 执行迁移工作

---

## 📊 数据管理文档

### 8. [代码变更记录机制](./code_changes_tracking.md)

- **描述**: 代码变更的记录方式和查询方法
- **内容**:
  - 消息维度 vs 对话维度
  - 数据库结构
  - 记录流程
  - 查询示例
  - 与 Git 的关系
  - 未来优化方向
- **适用**: 了解代码变更如何存储和查询

---

## 🗂️ 文档分类

### 按主题分类

#### 对话系统核心

- [对话逻辑链路](./conversation_logic.md)
- [Neovate 交互流程](./neovate_interaction_flow.md)
- [对话状态管理（简化版）](./conversation_state_management_simplified.md) ⭐

#### Worktree 架构

- [Worktree 和分支关系梳理](./worktree_branch_relationship.md) ⭐
- [Worktree 架构优化总结](./worktree_optimization_summary.md)
- [Worktree 迁移指南](./worktree_migration_guide.md)

#### 数据管理

- [代码变更记录机制](./code_changes_tracking.md)

### 按读者分类

#### 新手入门

1. [对话逻辑链路](./conversation_logic.md) - 了解整体架构
2. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 了解对话生命周期
3. [Worktree 架构优化总结](./worktree_optimization_summary.md) - 快速了解 Worktree
4. [代码变更记录机制](./code_changes_tracking.md) - 了解数据存储

#### 开发人员

1. [Worktree 和分支关系梳理](./worktree_branch_relationship.md) - 详细的技术实现
2. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 状态管理实现
3. [Neovate 交互流程](./neovate_interaction_flow.md) - AI 服务实现
4. [代码变更记录机制](./code_changes_tracking.md) - 数据库操作

#### 运维人员

1. [Worktree 迁移指南](./worktree_migration_guide.md) - 迁移和部署
2. [Worktree 架构优化总结](./worktree_optimization_summary.md) - 性能和资源
3. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 资源清理

---

## 🔄 文档更新历史

### 2026-01-21（下午）

- ✅ **状态简化**: 创建 [对话状态管理（简化版）](./conversation_state_management_simplified.md)
- ✅ 简化状态模型：从 5 种状态简化为 2 种（ACTIVE, ARCHIVED）
- ✅ 添加归档/恢复对话功能
- ✅ 添加 Worktree 清理机制
- ✅ 更新 API 路由和代码

### 2026-01-21（上午）

- ✅ 创建 [Worktree 和分支关系梳理](./worktree_branch_relationship.md)（优化版）
- ✅ 创建 [Worktree 架构优化总结](./worktree_optimization_summary.md)
- ✅ 创建 [Worktree 迁移指南](./worktree_migration_guide.md)
- ✅ 创建 [代码变更记录机制](./code_changes_tracking.md)
- ✅ 创建 [对话状态管理（旧版）](./conversation_state_management.md)
- ✅ 创建本索引文档

### 待更新

- ⏳ [对话逻辑链路](./conversation_logic.md) - 需要更新 Worktree 和状态相关内容
- ⏳ [Neovate 交互流程](./neovate_interaction_flow.md) - 需要更新工作目录说明

---

## 📖 阅读建议

### 场景 1: 我是新人，想了解整个系统

**推荐阅读顺序**:

1. [对话逻辑链路](./conversation_logic.md) - 了解整体架构
2. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 了解对话生命周期
3. [Worktree 架构优化总结](./worktree_optimization_summary.md) - 了解 Worktree 设计
4. [代码变更记录机制](./code_changes_tracking.md) - 了解数据存储

### 场景 2: 我要开发新功能

**推荐阅读顺序**:

1. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 了解状态控制
2. [Worktree 和分支关系梳理](./worktree_branch_relationship.md) - 详细的 API 说明
3. [Neovate 交互流程](./neovate_interaction_flow.md) - AI 服务调用
4. [代码变更记录机制](./code_changes_tracking.md) - 数据库操作

### 场景 3: 我要执行迁移

**推荐阅读顺序**:

1. [Worktree 架构优化总结](./worktree_optimization_summary.md) - 了解变更内容
2. [Worktree 迁移指南](./worktree_migration_guide.md) - 执行迁移
3. [Worktree 和分支关系梳理](./worktree_branch_relationship.md) - 验证结果

### 场景 4: 我要排查问题

**推荐阅读顺序**:

1. [对话逻辑链路](./conversation_logic.md) - 了解流程
2. [对话状态管理（简化版）](./conversation_state_management_simplified.md) - 检查状态
3. [Worktree 和分支关系梳理](./worktree_branch_relationship.md) - 检查 Worktree
4. [代码变更记录机制](./code_changes_tracking.md) - 查询数据

---

## 🔗 相关资源

### 代码文件

#### 核心服务

- `backend/src/services/ConversationManager.ts` - 对话管理、状态控制
- `backend/src/services/WorktreeManager.ts` - Worktree 管理、清理
- `backend/src/services/ConversationAIService.ts` - AI 服务
- `backend/src/services/NeovateAIService.ts` - Neovate 集成
- `backend/src/services/MessageRouter.ts` - 消息路由、状态检查

#### 数据库

- `backend/src/db/schema.ts` - 数据库表定义
- `backend/src/storage/ConversationStorageAdapter.ts` - 数据存储

#### API

- `backend/src/api/conversationRoutes.ts` - 对话 API（包含归档/恢复端点）
- `backend/src/types/index.ts` - 类型定义（包含状态枚举）

### 数据库表

#### 核心表

- `conversations` - 对话会话（包含 status 字段）
- `conversation_contexts` - 对话上下文
- `messages` - 消息
- `message_metadata` - 消息元数据（包含 code_changes）
- `neovate_sessions` - Neovate 会话映射

#### 项目表

- `projects` - 项目信息
- `users` - 用户信息

---

## 📝 文档贡献

### 如何更新文档

1. **修改现有文档**: 直接编辑对应的 `.md` 文件
2. **添加新文档**:
   - 在 `docs/` 目录下创建新文件
   - 在本索引文档中添加链接
   - 更新"文档更新历史"

### 文档规范

- 使用 Markdown 格式
- 包含清晰的标题和目录
- 提供代码示例
- 添加图表说明（如适用）
- 注明更新时间

---

## ❓ 常见问题

### Q: 文档太多，我应该从哪里开始？

**A**: 从 [对话逻辑链路](./conversation_logic.md) 开始，了解整体架构。

### Q: 对话状态是怎样的？

**A**: 现在简化为 2 种状态：**ACTIVE**（活跃中）和 **ARCHIVED**（已归档）。查看 [对话状态管理（简化版）](./conversation_state_management_simplified.md)。

### Q: 如何归档对话？

**A**: 调用 `POST /api/conversations/:sessionId/archive` API。归档后可以清理 worktree 释放磁盘空间。

### Q: 代码变更记录在哪里？

**A**: 记录在**消息维度**，查看 [代码变更记录机制](./code_changes_tracking.md) 了解详情。

### Q: Worktree 架构有什么变化？

**A**: 查看 [Worktree 架构优化总结](./worktree_optimization_summary.md)，快速了解变更。

### Q: 如何清理 worktree？

**A**: 先归档对话，然后调用 `WorktreeManager.cleanupArchivedWorktrees()` 方法。详见 [对话状态管理（简化版）](./conversation_state_management_simplified.md)。

### Q: 如何迁移到新架构？

**A**: 按照 [Worktree 迁移指南](./worktree_migration_guide.md) 执行。

---

## 📞 联系方式

如有文档相关问题，请联系：

- 技术负责人: [Name]
- 邮箱: [Email]
- 最后更新: 2026-01-21
