# 认证机制

## 登录

- POST `/api/auth/login`
- 规则：仅允许英文字母，长度 2-50

## 会话认证

- 请求头：`x-user-id` + `x-username`
- 未登录返回 401

## 前端行为

- localStorage 保存 user_id/username
- 401 时清理本地信息并弹出登录框
