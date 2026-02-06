# API 参考

## 认证

- POST `/api/auth/login`：登录（用户名）
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
- GET `/api/conversations/:sessionId/messages`：消息历史
- POST `/api/conversations/:sessionId/messages`：发送消息（SSE，支持 `model` 参数）
- DELETE `/api/conversations/:sessionId`：删除会话
- POST `/api/conversations/:sessionId/merge-request`：创建 MR
- POST `/api/conversations/:sessionId/archive`：归档会话
- PATCH `/api/conversations/:sessionId/visibility`：更新可见性

## 预览

- POST `/api/conversations/:sessionId/preview`：创建预览
- GET `/api/conversations/:sessionId/preview/status`：获取预览状态
- DELETE `/api/conversations/:sessionId/preview`：停止预览

## Docker Compose

- POST `/api/docker-compose/init`
- POST `/api/docker-compose/up`
- POST `/api/docker-compose/down`
- POST `/api/docker-compose/restart`
- GET `/api/docker-compose/ps`
- GET `/api/docker-compose/logs`
- POST `/api/docker-compose/build`
- POST `/api/docker-compose/deploy`

## Docker

- GET `/api/docker/containers`
- GET `/api/docker/containers/:id`
- POST `/api/docker/containers/:id/start`
- POST `/api/docker/containers/:id/stop`
- POST `/api/docker/containers/:id/restart`
- DELETE `/api/docker/containers/:id`
- GET `/api/docker/containers/:id/logs`
- GET `/api/docker/containers/:id/stats`
- POST `/api/docker/containers/create`
- GET `/api/docker/images`
- GET `/api/docker/images/:id`
- POST `/api/docker/images/pull`
- DELETE `/api/docker/images/:id`
- POST `/api/docker/images/build`
- GET `/api/docker/info`

## 已知缺口（代码现状）

- 暂无。
