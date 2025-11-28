# 代码工具可配置化 - 设计文档

## 概述

本设计文档描述了如何将现有系统中硬编码的 qodercli 工具改造为可配置的代码工具系统。通过引入适配器模式，系统能够支持多种 AI 代码工具（qodercli、Cursor、Copilot 等），提高系统的灵活性和可扩展性。

### 设计目标

1. **解耦代码工具**: 将代码工具的具体实现与业务逻辑分离
2. **统一接口**: 定义统一的代码工具接口，便于切换不同工具
3. **配置驱动**: 通过配置文件指定使用的代码工具
4. **易于扩展**: 添加新工具只需实现适配器接口
5. **向后兼容**: 保持现有 API 和功能不变

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      TaskOrchestrator                        │
│                    (任务编排器)                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ├─────────────────────────────────┐
                           │                                 │
                           ▼                                 ▼
              ┌────────────────────────┐      ┌──────────────────────┐
              │  CodeToolService       │      │  其他服务             │
              │  (代码工具服务)         │      │  (Git, GitLab等)     │
              └────────────┬───────────┘      └──────────────────────┘
                           │
                           │ 使用
                           ▼
              ┌────────────────────────┐
              │  ICodeToolProvider     │
              │  (代码工具接口)         │
              └────────────┬───────────┘
                           │
                           │ 实现
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────┐
│ QoderCliProvider │ │CursorProvider│ │CopilotProvider│
│  (qodercli适配器)│ │(Cursor适配器)│ │(Copilot适配器)│
└──────────────────┘ └──────────────┘ └──────────────┘
```

### 核心组件

1. **ICodeToolProvider (接口)**: 定义代码工具的统一接口
2. **QoderCliProvider**: qodercli 的具体实现
3. **CodeToolService**: 代码工具服务，负责加载和管理工具提供者
4. **CodeToolConfig**: 代码工具配置类，从环境变量或配置文件读取配置

## 组件和接口

### 1. ICodeToolProvider 接口

```typescript
/**
 * 代码工具提供者接口
 * 所有代码工具必须实现此接口
 */
export interface ICodeToolProvider {
  /**
   * 工具名称
   */
  readonly name: string;

  /**
   * 使用 AI 修改代码
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @returns 执行结果
   */
  modifyCode(prompt: string, workDir: string): Promise<CodeToolResult>;

  /**
   * 检查工具是否可用
   * @param workDir 工作目录
   * @returns 是否可用
   */
  isAvailable(workDir: string): Promise<boolean>;

  /**
   * 获取工具版本
   * @param workDir 工作目录
   * @returns 版本字符串
   */
  getVersion(workDir: string): Promise<string>;
}

/**
 * 代码工具执行结果
 */
export interface CodeToolResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  rawOutput?: string;
  error?: string;
}
```

### 2. QoderCliProvider 实现

```typescript
/**
 * qodercli 工具提供者
 */
export class QoderCliProvider implements ICodeToolProvider {
  readonly name = 'qodercli';

  constructor(private sshExecutor: SSHExecutor) {}

  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    // 实现 qodercli 的代码修改逻辑
    // 复用现有 NeovateAIService 的实现
  }

  async isAvailable(workDir: string): Promise<boolean> {
    // 检查 qodercli 是否安装
  }

  async getVersion(workDir: string): Promise<string> {
    // 获取 qodercli 版本
  }
}
```

### 3. CodeToolService 服务

```typescript
/**
 * 代码工具服务
 * 负责加载和管理代码工具提供者
 */
export class CodeToolService {
  private provider: ICodeToolProvider;

  constructor(
    private sshExecutor: SSHExecutor,
    private config: CodeToolConfig
  ) {
    this.provider = this.loadProvider();
  }

  /**
   * 根据配置加载代码工具提供者
   */
  private loadProvider(): ICodeToolProvider {
    const toolType = this.config.getToolType();
    
    switch (toolType) {
      case 'qodercli':
        return new QoderCliProvider(this.sshExecutor);
      case 'cursor':
        return new CursorProvider(this.sshExecutor);
      case 'copilot':
        return new CopilotProvider(this.sshExecutor);
      default:
        throw new Error(`不支持的代码工具类型: ${toolType}`);
    }
  }

  /**
   * 使用配置的工具修改代码
   */
  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    return this.provider.modifyCode(prompt, workDir);
  }

  /**
   * 检查工具是否可用
   */
  async isAvailable(workDir: string): Promise<boolean> {
    return this.provider.isAvailable(workDir);
  }

  /**
   * 获取工具信息
   */
  getToolInfo(): { name: string; version: Promise<string> } {
    return {
      name: this.provider.name,
      version: this.provider.getVersion('')
    };
  }
}
```

### 4. CodeToolConfig 配置类

```typescript
/**
 * 代码工具配置
 */
export class CodeToolConfig {
  private toolType: string;
  private toolOptions: Record<string, any>;

  constructor() {
    this.loadConfig();
  }

  /**
   * 从环境变量加载配置
   */
  private loadConfig(): void {
    // 从环境变量读取工具类型
    this.toolType = process.env.CODE_TOOL_TYPE || 'qodercli';
    
    // 读取工具特定的配置
    this.toolOptions = {
      // qodercli 配置
      qodercliPath: process.env.QODERCLI_PATH,
      qodercliArgs: process.env.QODERCLI_ARGS,
      
      // Cursor 配置
      cursorApiKey: process.env.CURSOR_API_KEY,
      cursorModel: process.env.CURSOR_MODEL,
      
      // Copilot 配置
      copilotApiKey: process.env.COPILOT_API_KEY,
    };
  }

  getToolType(): string {
    return this.toolType;
  }

  getToolOptions(): Record<string, any> {
    return this.toolOptions;
  }
}
```

## 正确性属性

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### 属性 1: 配置加载一致性

*对于任意*有效的配置文件内容，系统启动后读取的配置应该与文件中的配置完全一致

**验证需求: Requirements 1.1**

### 属性 2: 工具选择正确性

*对于任意*配置的工具类型（qodercli、cursor、copilot），系统应该使用对应的工具提供者执行代码修改

**验证需求: Requirements 1.2, 1.3**

### 属性 3: 项目克隆完整性

*对于任意*有效的 Git 仓库地址，克隆后的项目应该包含与远程仓库相同的文件和目录结构

**验证需求: Requirements 2.2, 2.3**

### 属性 4: 分支切换一致性

*对于任意*存在的分支名，切换后当前分支应该与指定的分支名一致

**验证需求: Requirements 2.4**

### 属性 5: 上下文保存完整性

*对于任意*初始化的项目，项目路径应该被正确保存到会话上下文中，后续操作应该使用该路径

**验证需求: Requirements 2.5**

### 属性 6: 项目列表完整性

*对于任意*工作目录，查询项目列表应该返回该目录下所有已初始化的项目

**验证需求: Requirements 3.1**

### 属性 7: 项目切换正确性

*对于任意*存在的项目，切换后当前工作项目上下文应该指向该项目

**验证需求: Requirements 3.2, 3.3**

### 属性 8: 项目删除完整性

*对于任意*存在的项目，删除后该项目的文件夹应该不再存在于工作目录中

**验证需求: Requirements 3.4**

### 属性 9: 分支删除完整性

*对于任意*功能分支，删除后该分支应该既不存在于本地也不存在于远程仓库

**验证需求: Requirements 4.2**

### 属性 10: MR 状态验证

*对于任意*功能分支，只有当 MR 已合并或用户明确放弃时，系统才应该允许删除该分支

**验证需求: Requirements 4.3**

### 属性 11: 错误记录完整性

*对于任意*失败的操作（分支删除、工具执行等），系统应该记录详细的错误信息

**验证需求: Requirements 4.4, 5.2, 5.4**

### 属性 12: 工具可用性检测准确性

*对于任意*配置的代码工具，系统启动时的可用性检测结果应该与工具的实际可用状态一致

**验证需求: Requirements 5.1**

### 属性 13: 工具状态查询准确性

*对于任意*时刻，查询工具状态应该返回当前实际使用的工具类型、版本和可用性

**验证需求: Requirements 5.3**

### 属性 14: 配置验证正确性

*对于任意*工具配置，只有当配置有效时，系统才应该应用该配置

**验证需求: Requirements 5.5**

### 属性 15: WebSocket 消息推送完整性

*对于任意*任务执行过程，系统应该通过 WebSocket 推送所有的日志和代码变更消息

**验证需求: Requirements 6.1, 6.2**

### 属性 16: 任务结果完整性

*对于任意*完成的任务，系统应该返回完整的执行结果和下一步操作建议

**验证需求: Requirements 6.4**

### 属性 17: 错误信息详细性

*对于任意*失败的任务，系统应该返回详细的错误信息和可能的解决方案

**验证需求: Requirements 6.5**

## 数据模型

### CodeToolResult

代码工具执行结果，统一不同工具的返回格式：

```typescript
interface CodeToolResult {
  success: boolean;        // 是否成功
  message: string;         // 执行消息
  changes: CodeChange[];   // 代码变更列表
  rawOutput?: string;      // 原始输出（用于调试）
  error?: string;          // 错误信息
}
```

### CodeToolConfig

代码工具配置，从环境变量读取：

```typescript
interface CodeToolConfig {
  toolType: string;                    // 工具类型: 'qodercli' | 'cursor' | 'copilot'
  toolOptions: Record<string, any>;    // 工具特定的配置选项
}
```

## 错误处理

### 错误类型

1. **配置错误**: 工具类型不支持、配置缺失
2. **工具不可用**: 工具未安装、认证失败
3. **执行错误**: 工具执行失败、超时
4. **解析错误**: 输出格式不正确、无法解析

### 错误处理策略

1. **配置验证**: 启动时验证配置的有效性
2. **降级处理**: 工具不可用时使用默认工具或返回友好错误
3. **重试机制**: 执行失败时自动重试（最多 3 次）
4. **详细日志**: 记录完整的错误信息和上下文

## 测试策略

### 单元测试

1. **ICodeToolProvider 实现测试**
   - 测试每个工具提供者的基本功能
   - 测试工具可用性检查
   - 测试版本获取

2. **CodeToolService 测试**
   - 测试工具加载逻辑
   - 测试工具切换
   - 测试错误处理

3. **CodeToolConfig 测试**
   - 测试配置读取
   - 测试默认值
   - 测试配置验证

### 集成测试

1. **端到端测试**
   - 测试完整的任务执行流程
   - 测试不同工具的切换
   - 测试错误恢复

## 迁移计划

### 阶段 1: 创建适配器接口和基础设施

1. 定义 ICodeToolProvider 接口
2. 创建 CodeToolConfig 配置类
3. 创建 CodeToolService 服务类

### 阶段 2: 实现 QoderCliProvider

1. 将现有 NeovateAIService 的逻辑迁移到 QoderCliProvider
2. 实现 ICodeToolProvider 接口
3. 保持现有功能不变

### 阶段 3: 更新 TaskOrchestrator

1. 将 NeovateAIService 替换为 CodeToolService
2. 更新依赖注入
3. 确保向后兼容

### 阶段 4: 添加其他工具支持（可选）

1. 实现 CursorProvider
2. 实现 CopilotProvider
3. 添加工具切换测试

## 配置示例

### 环境变量配置

```bash
# 代码工具类型
CODE_TOOL_TYPE=qodercli

# qodercli 配置
QODERCLI_PATH=/usr/local/bin/qodercli
QODERCLI_ARGS="-f json --yolo"

# Cursor 配置（未来支持）
# CODE_TOOL_TYPE=cursor
# CURSOR_API_KEY=your_api_key
# CURSOR_MODEL=gpt-4

# Copilot 配置（未来支持）
# CODE_TOOL_TYPE=copilot
# COPILOT_API_KEY=your_api_key
```

### .env 文件示例

```env
# 代码工具配置
CODE_TOOL_TYPE=qodercli

# SSH 配置
SSH_HOST=your_vm_host
SSH_PORT=22
SSH_USERNAME=your_username
SSH_PRIVATE_KEY_PATH=/path/to/private/key

# GitLab 配置
GITLAB_URL=https://gitlab.com
GITLAB_TOKEN=your_gitlab_token
GITLAB_PROJECT_ID=your_project_id

# 工作目录
WORK_DIR=/path/to/workspace
```

## 前端交互优化

### WebSocket 实时通信

保持现有的 WebSocket 通信机制，增强消息类型：

```typescript
// 工具状态消息
interface ToolStatusMessage {
  type: 'tool:status';
  data: {
    toolName: string;
    version: string;
    available: boolean;
  };
}

// 工具切换消息
interface ToolSwitchMessage {
  type: 'tool:switch';
  data: {
    oldTool: string;
    newTool: string;
  };
}
```

### 任务执行进度

增强任务执行进度展示：

1. **工具检查阶段**: 显示正在检查工具可用性
2. **代码修改阶段**: 显示正在使用 XX 工具修改代码
3. **结果解析阶段**: 显示正在解析工具输出
4. **完成阶段**: 显示执行结果和下一步操作

### 错误提示优化

针对不同错误类型提供具体的解决方案：

1. **工具不可用**: 提示安装或配置工具
2. **认证失败**: 提示检查 API Key 或登录状态
3. **执行超时**: 提示检查网络或增加超时时间
4. **解析失败**: 提示查看原始输出或联系支持

## 性能考虑

1. **工具初始化**: 在系统启动时初始化工具，避免每次任务都重新初始化
2. **配置缓存**: 缓存配置信息，避免重复读取
3. **并发控制**: 限制同时执行的任务数量，避免资源耗尽
4. **超时保护**: 设置合理的超时时间，防止任务卡死

## 安全考虑

1. **API Key 保护**: 敏感信息加密存储，不记录到日志
2. **命令注入防护**: 对用户输入进行转义和验证
3. **权限控制**: 限制工具的文件访问权限
4. **审计日志**: 记录所有工具调用和配置变更

