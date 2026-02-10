# Monorepo Workspace 规格

## 目标

- 统一使用 `pnpm workspace` 管理依赖与锁文件。
- 统一使用 `turbo` 管理跨包任务编排。
- 保证 `build`、`test` 任务语义清晰，不混入长驻服务启动逻辑。

## 包结构

- 根工作区包含：`frontend`、`backend`、`packages/*`。
- 公共类型与常量放在 `@front/shared`，由前后端通过 `workspace:*` 引用。

## 依赖与锁文件

- 仓库只保留根目录 `pnpm-lock.yaml`。
- 子包不允许提交独立 `pnpm-lock.yaml`。

## 任务编排

- 根命令：
  - `pnpm build` -> `turbo build`
  - `pnpm test` -> `turbo test`
- 部署前构建使用 Turbo 过滤构建：`pnpm turbo run build --filter=@front/shared --filter=web-frontend-intern-assistant-frontend --filter=web-frontend-intern-assistant-backend`。
- 根 `package.json` 必须声明 `packageManager`（例如 `pnpm@10.14.0`），保证 Turbo 能正确解析 workspace。
- `turbo.json` 使用 `tasks` 字段定义任务。
- `build` 任务产物需声明为真实输出目录。

## 子包脚本约束

- `backend build` 使用 `node --import tsx` 执行轻量构建脚本（运行时模式，不做 `tsc` 编译）。
- `backend start` 才用于启动运行态服务。
- `backend` 中不存在的脚本文件不得出现在 `package.json` scripts。

## 验收标准

- 执行 `pnpm build` 能在所有包完成构建后退出。
- 执行 `pnpm test` 不因构建脚本长驻而阻塞。
- 仓库内不存在子包锁文件。
