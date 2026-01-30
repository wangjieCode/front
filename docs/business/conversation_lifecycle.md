# 会话生命周期

## 创建

- 录入任务描述
- 设置模式（EDIT / READONLY）
- EDIT 模式会创建独立 Worktree

## 活跃状态（ACTIVE）

- 允许发送消息
- 允许创建 MR
- 允许启动预览

## 归档状态（ARCHIVED）

- 只读，禁止所有写入与执行
- 归档为不可逆操作
