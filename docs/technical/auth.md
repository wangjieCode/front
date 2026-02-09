# 认证机制

## 登录

- POST `/api/auth/login`
- 规则：用户名仅允许英文字母（2-50），密码长度 6-128
- 成功返回：`userId`、`username`、`hasPassword`、`token`（JWT）

## 会话认证

- 请求头：`Authorization: Bearer <jwt>`
- 密钥：`JWT_SECRET`（生产环境必须配置）
- JWT 实现：`jsonwebtoken`（社区标准库）
- 未登录返回 401

## 前端行为

- localStorage 保存 `fi_auth_user_id_v2`、`fi_auth_username_v2`、`fi_auth_has_password_v2`、`fi_auth_token_v2`
- 登录态判定要求 `fi_auth_token_v2` 存在
- 所有受保护请求统一注入 `Authorization: Bearer <jwt>`
- 401 时清理本地信息并弹出登录框
