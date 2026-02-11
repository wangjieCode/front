# API 参考

## 认证

- POST `/api/auth/login`：登录（用户名+密码，返回 JWT）
- GET `/api/auth/verify`：校验登录态

## 项目

- POST `/api/projects`：创建项目
- GET `/api/projects`：项目列表
- GET `/api/projects/:id`：项目详情
- PUT `/api/projects/:id`：更新项目
- DELETE `/api/projects/:id`：删除项目
- POST `/api/projects/:id/pull`：拉取更新

## 会话

- POST `/api/conversations`：创建会话（支持 `model` 参数，默认 `iflow/qwen3-coder-plus`）
- GET `/api/conversations`：会话列表
- GET `/api/conversations/:sessionId`：会话详情
- GET `/api/conversations/:sessionId/messages`：消息历史（支持 `since=<ISO时间>` 增量拉取）
- POST `/api/conversations/:sessionId/messages`：发送消息（SSE，支持 `model` 参数）
- DELETE `/api/conversations/:sessionId`：删除会话
- POST `/api/conversations/:sessionId/merge-request`：创建 MR
- POST `/api/conversations/:sessionId/archive`：归档会话
- PATCH `/api/conversations/:sessionId/visibility`：更新可见性

## 预览

- POST `/api/conversations/:sessionId/preview`：创建预览
- GET `/api/conversations/:sessionId/preview/status`：获取预览状态
- DELETE `/api/conversations/:sessionId/preview`：停止预览

## 已知缺口（代码现状）

- 暂无。
