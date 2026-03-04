# Zadig 工作流发布 Skill 规格

## 基本信息

- 名称：Zadig Workflow Deploy Skill
- 负责人：
- 创建日期：2026-03-03
- 最近更新：2026-03-03

## 背景

- 现状：在 Zadig 页面执行发布需要人工逐步点击并切分支，重复操作多、出错率高。
- 问题：缺少“按环境 + 项目 + 分支”参数化发布的标准脚本与 skill，无法稳定复用。

## 目标

- 提供一个可复用 skill，支持在 Zadig 中按最小参数触发发布。
- 固化发布接口链路：`workflow/find -> workflowtask/preset -> workflowtask`。
- 分支切换仅支持单仓库模式（`repo + branch`）。

## 非目标

- 不在仓库中保存账号、密码或 JWT。
- 不实现完整 Dex 浏览器登录重放（cookie/redirect 链路）。
- 不兼容多套历史发布协议，只保留当前统一链路。

## 范围

- In：`skills/zadig-workflow-deploy/` 下的 skill 描述、执行脚本、接口参考。
- Out：Zadig UI 页面改造、后端服务端代码修改。

## 业务规则

- 必须通过 Bearer Token 访问 Aslan API。
- Token 仅从环境变量 `ZADIG_TOKEN` 读取。
- 固定 `base-url=https://zadig.dtminds.cn` 与 `project=smp`。
- 发布请求体必须基于 preset 结果生成后再覆盖分支。
- workflow 仅允许 `FE-test01`、`test02`、`test03`。
- env 由 workflow 自动推导，不接受命令行传入。
- 指定 repo 未在 preset 中匹配到时必须失败，避免误发布。
- 默认只触发命中 repo 的 targets，避免误触发同 workflow 下的其他服务。
- 触发前必须校验最终 payload 中仅有 1 个 target；大于 1 必须失败退出。

## 需求

### 功能需求

- F1：仅支持 `--workflow`、`--repo`、`--branch` 参数。
- F2：workflow 仅允许 `FE-test01`、`test02`、`test03`。
- F3：支持 `--dry-run` 输出最终 payload 但不触发发布。
- F4：默认按命中 repo 裁剪 `targets`。
- F5：若裁剪后 target 数量不等于 1，脚本必须失败并提示命中详情。

### 非功能需求

- N1：日志输出精简，明确展示分支覆盖结果。
- N2：接口失败时输出 URL、状态码和响应体，便于排障。

## 用户体验

- 关键流程：设置 `ZADIG_TOKEN` -> 运行脚本 -> 覆盖分支 -> 触发工作流。
- 失败提示：明确区分 token 失效、repo 未匹配、payload 非法三类问题。

## 数据与接口

- 数据结构：复用 Zadig preset 返回结构，不新增本地持久化数据。
- 接口清单：
  - `GET /api/aslan/workflow/workflow/find/:workflow`
  - `GET /api/aslan/workflow/workflowtask/preset/:env/:workflow`
  - `POST /api/aslan/workflow/workflowtask/:workflow`

## 验收标准

- A1：脚本可根据指定 repo 将 preset 中对应分支更新为目标分支。
- A2：`--dry-run` 时不触发发布，仅输出完整 payload。
- A3：成功触发时输出 Zadig 返回结果；失败时返回非 0 退出码。

## 风险与依赖

- 风险：Zadig API 字段变更会导致 preset 覆盖逻辑失效。
- 依赖：运行环境 Node.js 18+（内置 fetch），并可访问 Zadig 域名。

## 迭代记录

- 2026-03-03：新增 `zadig-workflow-deploy` skill 与发布脚本。
