# 文档总览

本目录为“规格驱动 + 迭代记录”体系，覆盖业务文档与技术文档。

## 使用顺序

1. `context/`：稳定上下文与通用约束
2. `specs/`：规格文档（所有需求与实现的单一事实来源）
3. `business/`：面向业务与产品的说明
4. `technical/`：面向研发与运维的说明
5. `iterations/`：每次代码迭代记录（必须新增日期文件）

## 目录结构

- `context/`：系统上下文、术语、环境变量
- `specs/`：功能规格（含模板）
- `business/`：产品与业务流程
- `technical/`：架构、接口、数据、实现细节
- `iterations/`：代码迭代记录
- `templates/`：规范模板

## 快速入口

- 规格模板：`templates/SPEC_TEMPLATE.md`
- 迭代记录规则：`iterations/README.md`
- 系统上下文：`context/system.md`
- API 参考：`technical/api_reference.md`

## 更新规则

- 修改实现时：必须同步更新对应规格 + 追加迭代记录。
- 删除旧逻辑时：文档必须同步删除旧描述，保持一致。
