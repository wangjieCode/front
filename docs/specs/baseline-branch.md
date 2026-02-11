# 基线分支选择

## 目标

- 创建对话时可选基线分支，默认取项目的默认分支。
- 基线分支用于：创建 worktree、创建对话分支、创建 MR 的目标分支。
- 基线分支来源：GitLab API（使用 projects.gitlab_project_id）。

## 数据约定

- 前端创建对话时传 `projectId` + `baseBranch`。
- 后端在编辑模式下基于基线分支创建 worktree，并将 `context.projectInfo.workDir` 与 `worktreePath` 更新为 worktree 路径。
- MR 目标分支取 `context.projectInfo.gitBranch`（即基线分支）。

## 接口

- `GET /api/conversations/gitlab/branches?projectId=...`
  - 返回：`{ branches: string[], defaultBranch?: string }`

## 可观测性

- 分支查询链路需打印关键日志：
  - 路由入口参数：`projectId`、`userId`。
  - 服务层参数：`gitlabProjectId`、项目默认分支。
  - GitLab 请求结果：分页页码、`status/statusText`、已拉取分支数量、失败响应体片段。
  - 返回汇总：`branchesCount`、GitLab 默认分支、最终默认分支及其来源（GitLab 或项目配置）。
- 当 `branches` 为空或 GitLab 默认分支缺失时，需输出 `warn` 日志，明确提示已触发回退。

## 关键流程

1. 前端根据 `projectId` 拉取 GitLab 分支列表与默认分支。
2. 用户选择基线分支（默认值为 GitLab 默认分支）。
3. 创建对话时提交 `projectId` 与 `baseBranch`。
4. 分支列表需完整拉取（支持分页），保证新建分支可见。
4. 编辑模式：
- 在 `{WORKTREE_BASE_DIR}/project-{projectId}/user-{userId}/conversation-{sessionId}` 创建 worktree。
  - 从基线分支创建对话分支并切换到 worktree。
5. 创建 MR 时使用基线分支作为目标分支。
