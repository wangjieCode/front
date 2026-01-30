# 规格：Worktree 管理

## 基本信息

- 名称：每会话独立 Worktree
- 负责人：未指定
- 创建日期：2026-01-30
- 最近更新：2026-01-30

## 背景

- 多会话共享分支会引发冲突与切换成本。

## 目标

- 每个会话独立 Worktree 与分支。

## 非目标

- 不复用同一 Worktree。

## 范围

- In：创建、查询、清理 Worktree。
- Out：跨会话合并策略。

## 业务规则

- Worktree 路径固定规则。
- 分支名按 sessionId + 时间戳生成。

## 需求

### 功能需求

- F1：EDIT 模式创建 Worktree。
- F2：查询 Worktree 信息可缓存。
- F3：删除 Worktree 时删除分支。

### 非功能需求

- N1：分支名需要可追溯。

## 用户体验

- 会话创建后立即可编辑。

## 数据与接口

- conversation_contexts.worktree_path / context_git_branch。

## 验收标准

- A1：多会话同时创建互不影响。
- A2：Worktree 删除后仓库无残留分支。

## 风险与依赖

- 风险：磁盘占用增大。

## 迭代记录

- 2026-01-30：重建规格文档。
