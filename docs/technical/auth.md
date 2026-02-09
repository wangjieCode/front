# 认证机制

## 登录

- POST `/api/auth/login`
- 规则：仅允许英文字母，长度 2-50

## 会话认证

- 请求头：`x-user-id` + `x-username`
- 未登录返回 401

## 前端行为

- localStorage 保存 `fi_auth_user_id_v2`、`fi_auth_username_v2`、`fi_auth_has_password_v2`、`fi_auth_token_v2`
- 登录态判定要求 `fi_auth_token_v2` 存在
- 401 时清理本地信息并弹出登录框
