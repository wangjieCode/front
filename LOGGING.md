# 日志说明文档

## 概述

系统在关键位置添加了详细的日志，方便排查问题。所有日志都输出到控制台（stdout/stderr）。

## 日志格式

日志使用统一的前缀格式：`[组件名] 日志内容`

例如：
```
[CodeToolService] 开始 modifyCode
[NeovateProvider] 执行命令: neovate -q --cwd ...
[LocalExecutor] 命令执行成功
```

## 日志级别标识

- ✅ - 成功操作
- ❌ - 错误或失败
- ⚠️ - 警告

## 主要组件日志

### 1. CodeToolService

**位置**: `backend/src/services/CodeToolService.ts`

**日志内容**:
- 工具加载信息
- 配置验证结果
- 工具可用性检查
- 执行开始和结束
- 错误信息

**示例**:
```
[CodeToolService] 加载代码工具提供者: neovate
[CodeToolService] ✅ 加载 NeovateProvider
[CodeToolService] 开始 modifyCode
[CodeToolService] 工具: neovate
[CodeToolService] 验证配置...
[CodeToolService] ✅ 配置验证通过
[CodeToolService] 检查工具可用性...
[CodeToolService] ✅ 工具可用
[CodeToolService] 调用 provider.modifyCode...
[CodeToolService] ✅ modifyCode 完成，成功: true
```

### 2. NeovateProvider

**位置**: `backend/src/providers/NeovateProvider.ts`

**日志内容**:
- 执行开始时间
- 提示词和工作目录
- 构造的命令
- IFLOW_API_KEY 检查
- 命令执行时间
- 退出码
- 输出预览
- 解析结果
- 错误信息

**示例**:
```
[NeovateProvider] 开始执行 modifyCode
[NeovateProvider] 提示词: 修改登录页面样式
[NeovateProvider] 工作目录: /path/to/project
[NeovateProvider] 构造的命令: neovate -q --cwd "/path" --output-format json --approval-mode yolo "..."
[NeovateProvider] IFLOW_API_KEY 是否存在: true
[NeovateProvider] 开始执行命令...
[NeovateProvider] 命令执行完成，耗时: 5234ms
[NeovateProvider] 退出码: 0
[NeovateProvider] === neovate 原始输出 ===
[NeovateProvider] {"type":"system","subtype":"init"...
[NeovateProvider] === neovate 输出结束 ===
[NeovateProvider] 开始解析输出...
[NeovateProvider] 解析完成，找到 3 个文件变更
```

**流式执行日志**:
```
[NeovateProvider] 开始执行 modifyCodeStream (流式)
[NeovateProvider] 构造的命令 (流式): neovate -q --cwd ...
[NeovateProvider] 开始流式执行命令...
[NeovateProvider] 已接收 10 个数据块，总长度: 1024
[NeovateProvider] 已接收 20 个数据块，总长度: 2048
[NeovateProvider] 流式执行完成，耗时: 8456ms
[NeovateProvider] 总共接收 25 个数据块
```

### 3. LocalExecutor

**位置**: `backend/src/services/LocalExecutor.ts`

**日志内容**:
- 执行的命令（前100字符）
- 工作目录
- IFLOW_API_KEY 传递状态
- 执行结果
- stdout/stderr 长度
- 错误信息

**示例**:
```
[LocalExecutor] 执行命令: neovate -q --cwd "/Users/user/project" --output-format json --approval-mode yolo "修改...
[LocalExecutor] 工作目录: /Users/user/project
[LocalExecutor] IFLOW_API_KEY 已传递: true
[LocalExecutor] ✅ 命令执行成功
[LocalExecutor] stdout 长度: 5432
[LocalExecutor] stderr 长度: 0
```

**流式执行日志**:
```
[LocalExecutor] 流式执行命令: neovate -q --cwd ...
[LocalExecutor] 工作目录: /Users/user/project
[LocalExecutor] IFLOW_API_KEY 已传递: true
[LocalExecutor] 启动子进程...
[LocalExecutor] 子进程结束，退出码: 0
[LocalExecutor] stdout 总长度: 8765
[LocalExecutor] stderr 总长度: 0
```

## 常见问题排查

### 问题 1: neovate 执行卡住

**查看日志**:
```
[NeovateProvider] 开始执行命令...
```
如果日志停在这里，说明命令执行卡住。

**检查**:
1. 查看 IFLOW_API_KEY 是否存在：
   ```
   [NeovateProvider] IFLOW_API_KEY 是否存在: false
   ```
   如果为 false，需要配置 API key

2. 查看命令是否正确：
   ```
   [NeovateProvider] 构造的命令: neovate -q --cwd ...
   ```

### 问题 2: 工具不可用

**查看日志**:
```
[CodeToolService] ❌ 工具不可用: neovate
```

**解决方案**:
1. 检查 neovate 是否安装：`which neovate`
2. 检查 PATH 环境变量

### 问题 3: 配置验证失败

**查看日志**:
```
[CodeToolService] ❌ 配置验证失败: CODE_TOOL_TYPE 未设置
```

**解决方案**:
1. 检查 `.env` 文件中的 `CODE_TOOL_TYPE` 配置
2. 重启后端服务

### 问题 4: 命令执行失败

**查看日志**:
```
[LocalExecutor] ❌ 命令执行失败
[LocalExecutor] 错误码: 1
[LocalExecutor] 错误信息: Command failed: ...
```

**解决方案**:
1. 查看完整的错误信息
2. 检查工作目录是否存在
3. 检查权限问题

## 查看日志

### 开发环境

后端日志直接输出到终端：
```bash
cd backend
npm run dev
```

### 生产环境

使用 PM2 或其他进程管理器时，查看日志：
```bash
# PM2
pm2 logs backend

# 或查看日志文件
tail -f /path/to/logs/backend.log
```

## 日志过滤

使用 grep 过滤特定组件的日志：

```bash
# 只看 NeovateProvider 的日志
npm run dev 2>&1 | grep "\[NeovateProvider\]"

# 只看错误日志
npm run dev 2>&1 | grep "❌"

# 只看成功日志
npm run dev 2>&1 | grep "✅"
```

## 调试技巧

### 1. 追踪完整执行流程

按顺序查看日志：
```
[CodeToolService] 开始 modifyCode
  ↓
[CodeToolService] 验证配置...
  ↓
[CodeToolService] 检查工具可用性...
  ↓
[CodeToolService] 调用 provider.modifyCode...
  ↓
[NeovateProvider] 开始执行 modifyCode
  ↓
[NeovateProvider] 构造的命令: ...
  ↓
[LocalExecutor] 执行命令: ...
  ↓
[LocalExecutor] ✅ 命令执行成功
  ↓
[NeovateProvider] 命令执行完成，耗时: XXXms
  ↓
[CodeToolService] ✅ modifyCode 完成
```

### 2. 性能分析

查看执行时间：
```bash
npm run dev 2>&1 | grep "耗时"
```

输出示例：
```
[NeovateProvider] 命令执行完成，耗时: 5234ms
[NeovateProvider] 流式执行完成，耗时: 8456ms
```

### 3. 错误定位

查看所有错误：
```bash
npm run dev 2>&1 | grep -E "❌|错误|失败"
```

## 注意事项

1. **敏感信息**: 日志中不会输出完整的 API key，只显示是否存在
2. **命令长度**: 长命令会被截断显示（前100字符）
3. **输出长度**: 大量输出会显示长度而不是完整内容
4. **生产环境**: 建议使用日志管理工具（如 ELK、Loki）收集和分析日志

## 禁用详细日志

如果需要减少日志输出，可以设置环境变量：

```bash
# .env 文件
LOG_LEVEL=error  # 只输出错误日志
```

（注：此功能需要额外实现日志级别控制）
