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
- 部署日志命令约束：
  - `pnpm logs <进程名>`、`pnpm logs:view <进程名> [N]`、`pnpm logs:error <进程名> [N]` 需同时包含 `~/.pm2/pm2.log`，避免实例日志为空时无法定位进程重启原因。
  - `all` 或进程 ID 查询保留 PM2 原生命令行为，不增加额外分支。
- API 多实例部署约束：
  - PM2 必须以 `dist/index.js` 作为脚本并使用 `-i <instances>` 多实例启动（cluster 模式），确保多实例共享同一端口。
  - 部署链路不依赖线上 `tsx` 运行时，避免 loader 解析失败导致进程重启。
  - 部署打包必须包含 `backend/dist`，禁止仅上传 `backend/src` 导致远端缺少运行产物。
- 根 `package.json` 必须声明 `packageManager`（例如 `pnpm@10.14.0`），保证 Turbo 能正确解析 workspace。
- `turbo.json` 使用 `tasks` 字段定义任务。
- `build` 任务产物需声明为真实输出目录。

## 子包脚本约束

- `backend build` 必须产出可运行的 `dist` JavaScript 产物（至少包含 `dist/index.js`）。
- `backend build` 使用 TypeScript 编译器（`tsc`）生成 `dist` 产物，不使用自定义转译脚本。
- `backend start` 才用于启动运行态服务。
- `backend` 中不存在的脚本文件不得出现在 `package.json` scripts。

## 验收标准

- 执行 `pnpm build` 能在所有包完成构建后退出。
- 执行 `pnpm test` 不因构建脚本长驻而阻塞。
- 仓库内不存在子包锁文件。
