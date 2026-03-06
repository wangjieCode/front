# 规格：代码变更记录

## 基本信息

- 名称：消息维度的代码变更记录
- 负责人：未指定
- 创建日期：2026-01-30
- 最近更新：2026-03-05

## 背景

- 需要精确追踪 AI 每次修改的代码。

## 目标

- 每条 AI 消息记录变更列表。
- 提供只读 review 侧边栏按文件查看能力。
- 优化消息后代码变更呈现与性能。

## 非目标

- 不提供审核流、评论协作、审批状态管理。

## 范围

- In：
  - message_metadata.code_changes（轻量索引）
  - review_rounds、review_file_changes、review_diff_blobs（只读投影）
- Out：
  - 消息后仅展示文件名
  - 统一 review 侧边栏按文件展示

## 业务规则

- 只有 AI 消息会写入 code_changes。
- review 投影仅用于只读查询，不参与审核流。

## 需求

### 功能需求

- F1：解析变更并保存到消息元数据。
- F2：支持按消息读取变更。
- F3：按轮次与文件生成 review 投影（review_rounds、review_file_changes）。
- F4：提供只读接口：
  - GET /api/conversations/:sessionId/review/sidebar
  - GET /api/conversations/:sessionId/review/files
  - GET /api/conversations/:sessionId/review/diff?filePath=
  - GET /api/conversations/:sessionId/review/updates?since=
- F5：消息后代码变更仅展示文件名与变更类型，不展示 diff 内容。
- F6：右侧详情通过 `review_diff_blobs` 读取压缩 diff 并解压返回。
- F7：不做历史回填，发布时直接清理旧 diff 存储并删除旧列。
- F8：review 区域默认只展示“最新轮次（基线->最新）”的文件与 diff，不展示消息关联关系。
- F9：前端 review diff 渲染采用开源组件 `react-diff-view`，支持 unified/split 两种查看模式。

### 非功能需求

- N1：无变更时允许为空。
- N2：侧边栏接口失败时显示明确错误态，不回退到消息 metadata diff。
- N3：列表接口不返回全量 diff，diff 按文件懒加载。
- N4：diff 文本按 hash 去重并压缩存储，降低数据库体积增长。

## 用户体验

- 用户可以在消息后快速查看文件清单，并在侧边栏按文件查看最新轮次 diff（支持搜索、上一/下一文件、复制 diff、unified/split 切换）。

## 数据与接口

- 表：
  - message_metadata.code_changes（仅 filePath/changeType）
  - review_rounds
  - review_file_changes
  - review_diff_blobs
- 接口：
  - GET /review/sidebar
  - GET /review/files
  - GET /review/diff
  - GET /review/updates

## 验收标准

- A1：AI 消息保存后可查询变更列表。
- A2：review/files 可返回文件级摘要列表（filePath/changeType/additions/deletions）。
- A3：review/diff 缺少 filePath 返回 400。
- A4：前端消息后展示摘要优先，默认不全量渲染 diff。
- A4：前端消息后只展示文件名称列表，不渲染 diff。
- A5：`review_file_changes` 不再存储原始 diff 大文本，改为引用 `diff_blob_id`。

## 风险与依赖

- 风险：依赖 git diff 与输出解析稳定性。
- 风险：投影数据与 message metadata 的一致性需靠写入幂等与容错保障。

## 迭代记录

- 2026-01-30：重建规格文档。
- 2026-03-05：新增只读 review 侧边栏能力、文件级接口与消息后摘要优先展示。
- 2026-03-05：改为消息只展示文件名，diff 全量下沉到 `review_diff_blobs`，并采用直接清理旧 diff（无历史回填）。
- 2026-03-05：review 默认口径调整为“最新轮次”，移除消息关联展示，前端接入 `react-diff-view` 并增强可用性。
