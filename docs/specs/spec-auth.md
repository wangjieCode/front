# 规格：认证与登录

## 基本信息

- 名称：认证与登录
- 负责人：未指定
- 创建日期：2026-01-30
- 最近更新：2026-02-09

## 背景

- 需要最小成本的登录与身份识别能力。

## 目标

- 提供用户名密码登录并返回 userId 与 JWT。
- 所有受保护 API 使用 `Authorization: Bearer <jwt>` 鉴权。

## 非目标

- 不提供复杂的角色或权限体系。

## 范围

- In：登录、登录态校验、请求头透传。
- Out：OAuth、角色模型。

## 业务规则

- 用户名仅允许英文字母，长度 2-50。
- 密码长度 6-128。
- 已存在且未设置密码的账号，在登录时使用本次提交的密码完成初始化。
- 未登录请求返回 401。

## 需求

### 功能需求

- F1：`POST /api/auth/login` 创建或更新用户并签发 JWT。
- F2：`GET /api/auth/verify` 基于 JWT 校验登录态。

### 非功能需求

- N1：登录失败需要明确错误信息。

## 用户体验

- 前端登录成功后写入 localStorage。
- 401 时清理本地信息并提示登录。
- 登录态判定必须包含前端 token 字段 `fi_auth_token_v2`，避免因残留用户信息误判为已登录。
- 登录后可通过“账号设置”入口修改用户名与密码。

## 数据与接口

- users 表：id、username、last_login_at。
- Header：`Authorization: Bearer <jwt>`。
- 登录成功响应包含：`userId`、`username`、`hasPassword`、`token`。
- JWT 签发与校验使用社区标准库 `jsonwebtoken`。
- 前端 localStorage 字段：`fi_auth_user_id_v2`、`fi_auth_username_v2`、`fi_auth_has_password_v2`、`fi_auth_token_v2`。

## 验收标准

- A1：合法用户名与密码可登录并返回 `userId` 与 JWT。
- A2：缺少或非法用户名返回 400。
- A3：已存在且无密码的账号，登录成功后返回 `hasPassword=true`，后续登录需校验密码。
- A4：受保护接口仅接受 `Authorization: Bearer <jwt>`，缺失或无效时返回 401。

## 风险与依赖

- 风险：仅用户名登录的安全性较弱。

## 迭代记录

- 2026-01-30：重建规格文档。
- 2026-02-09：登录态判定增加 token 字段约束，并更新前端本地存储字段命名。
- 2026-02-09：修正老账号无密码场景，首次登录会初始化密码哈希并返回 `hasPassword=true`。
- 2026-02-09：鉴权改为标准 JWT，移除 `x-user-id`/`x-username` 头透传逻辑。
- 2026-02-09：恢复前端账号设置入口，支持修改用户名与密码。
- 2026-02-09：JWT 实现替换为 `jsonwebtoken` 社区标准库。
