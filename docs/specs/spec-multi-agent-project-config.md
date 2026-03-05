# 项目级 Multi-Agent 配置规格

## 基本信息

- 名称：项目级 Multi-Agent 配置
- 负责人：研发协作组
- 创建日期：2026-03-05
- 最近更新：2026-03-05

## 背景

- 现状：当前项目尚未定义可复用的项目级子 agent 角色。
- 问题：架构设计、编码实现、产品走查在协作时缺少明确分工，角色调用不稳定。

## 目标

- 在当前项目内新增可复用的 3 个子 agent 角色。
- 明确每个角色职责边界与默认行为，减少角色漂移。
- 配置仅在当前仓库生效，不污染全局 `~/.codex/config.toml`。

## 非目标

- 不修改全局 Codex 配置。
- 不新增与本次角色无关的 agent。
- 不实现历史角色兼容层。

## 范围

- In：`.codex/config.toml` 与 `.codex/agents/*.toml`。
- Out：业务代码逻辑改造、前后端功能变更。

## 业务规则

- 子 agent 角色定义在项目级 `.codex/config.toml` 的 `[agents]` 下。
- 每个角色必须通过 `config_file` 指向独立 TOML 配置文件。
- `system_architect` 与 `product_expert` 默认 `sandbox_mode = "read-only"`。
- `software_engineer` 默认 `sandbox_mode = "workspace-write"`。
- 角色数量固定为 3 个：`system_architect`、`software_engineer`、`product_expert`。

## 需求

### 功能需求

- F1：提供 `system_architect`，负责系统架构设计、数据库设计、技术选型。
- F2：提供 `software_engineer`，负责编码完成实际功能并在改动范围内验证。
- F3：提供 `product_expert`，负责功能规划、走查与系统易用性提升建议。

### 非功能需求

- N1：配置结构清晰，角色职责可直接从描述和指令中理解。
- N2：角色配置可在仓库内直接版本化管理与评审。

## 用户体验

- 关键流程：在当前项目打开 Codex 会话 -> 按角色名触发子 agent -> 角色按既定职责执行。
- 失败提示：若 `config_file` 缺失或路径错误，agent 创建会失败并提示配置加载错误。

## 数据与接口

- 数据结构：TOML 配置文件（项目级主配置 + 角色配置）。
- 接口清单：无新增业务接口。

## 验收标准

- A1：当前仓库存在 `.codex/config.toml` 且包含 3 个目标角色定义。
- A2：3 个角色均有独立 `config_file` 并可被解析。
- A3：未修改 `~/.codex/config.toml` 全局配置。

## 风险与依赖

- 风险：若后续移动/重命名角色配置文件，`config_file` 引用会失效。
- 依赖：Codex CLI 已开启 `multi_agent` 功能。

## 迭代记录

- 2026-03-05：新增项目级 multi-agent 三角色配置与文档。
