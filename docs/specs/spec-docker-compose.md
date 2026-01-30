# 规格：Docker Compose 管理

## 基本信息

- 名称：Docker Compose 管理接口
- 负责人：未指定
- 创建日期：2026-01-30
- 最近更新：2026-01-30

## 背景

- 提供统一的 compose 生命周期管理能力。

## 目标

- 通过 API 管理 compose 文件与服务。

## 非目标

- 不提供可视化运维面板。

## 范围

- In：init / up / down / restart / ps / logs / build / deploy。
- Out：复杂编排策略。

## 业务规则

- 必须传入 workDir。

## 需求

### 功能需求

- F1：初始化 docker-compose.yml。
- F2：管理服务生命周期。

### 非功能需求

- N1：输出命令执行结果。

## 用户体验

- 失败时返回标准错误信息。

## 数据与接口

- /api/docker-compose/*

## 验收标准

- A1：init 成功后可启动服务。

## 风险与依赖

- 依赖宿主机 docker-compose。

## 迭代记录

- 2026-01-30：重建规格文档。
