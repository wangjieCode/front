/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  SUCCESS = 'success',
  FAILED = 'failed'
}

/**
 * 任务类型枚举
 */
export enum TaskType {
  CODE_CHANGE = 'code_change',  // 代码修改任务（需要创建 MR）
  QUERY = 'query'                // 查询任务（只返回信息）
}

/**
 * 日志级别枚举
 */
export enum LogLevel {
  INFO = 'info',
  ERROR = 'error'
}

/**
 * 代码变更类型枚举
 */
export enum ChangeType {
  ADDED = 'added',
  MODIFIED = 'modified',
  DELETED = 'deleted'
}

/**
 * 任务接口
 */
export interface Task {
  id: string;
  prompt: string;
  type: TaskType;  // 任务类型
  status: TaskStatus;
  branchName?: string;
  mrUrl?: string;
  result?: string;  // 查询类任务的结果
  createdAt: Date;
  completedAt?: Date;
  error?: string;
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
}

/**
 * 代码变更接口
 */
export interface CodeChange {
  filePath: string;
  changeType: ChangeType;
  diff: string;
}

/**
 * Merge Request 接口
 */
export interface MergeRequest {
  mrId: number;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
}

/**
 * SSH 配置接口
 */
export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  privateKey?: string;
  password?: string;
}

/**
 * 命令执行结果接口
 */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * 命令执行器接口
 * SSHExecutor 和 LocalExecutor 都实现此接口
 */
export interface ICommandExecutor {
  isConnected(): boolean;
  executeCommand(command: string, workDir?: string, timeout?: number, env?: Record<string, string>): Promise<CommandResult>;
  executeCommandStream?(
    command: string,
    workDir: string | undefined,
    onData: (data: string) => void,
    timeout?: number,
    env?: Record<string, string>
  ): Promise<CommandResult>;
  testConnection(): Promise<boolean>;
}

/**
 * MR 参数接口
 */
export interface MRParams {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}

/**
 * 代码工具执行结果接口
 */
export interface CodeToolResult {
  success: boolean;
  message: string;
  changes: CodeChange[];
  rawOutput?: string;
  error?: string;
}

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
 * 代码工具配置接口
 */
export interface CodeToolConfigData {
  toolType: string;
  toolOptions: Record<string, any>;
}

// ==================== 对话相关类型定义 ====================

/**
 * 创建对话请求接口
 */
export interface CreateConversationRequest {
  initialPrompt: string;      // 初始提示词
  taskId: string;              // 任务ID
  mode?: ConversationMode;     // 对话模式（可选）
  projectId: string;           // 项目ID（必填）
}

/**
 * 对话模式枚举
 */
export enum ConversationMode {
  EDIT = 'edit',              // 编辑模式：允许修改代码，创建分支和 MR
  READONLY = 'readonly'       // 只读模式：只能查询代码，不能修改
}

/**
 * 操作类型枚举
 */
export enum OperationType {
  READ_FILE = 'read_file',           // 读取文件
  SEARCH_CODE = 'search_code',       // 搜索代码
  MODIFY_CODE = 'modify_code',       // 修改代码
  CREATE_FILE = 'create_file',       // 创建文件
  DELETE_FILE = 'delete_file',       // 删除文件
  CREATE_BRANCH = 'create_branch',   // 创建分支
  CREATE_MR = 'create_mr',           // 创建 MR
  PREVIEW_PROJECT = 'preview_project' // 预览项目
}

/**
 * 对话会话状态枚举（简化版）
 */
export enum ConversationStatus {
  ACTIVE = 'active',          // 活跃中 - 可以对话、发送消息、预览等
  ARCHIVED = 'archived'       // 已归档 - 只读，禁用所有编辑功能，可清理 worktree
}

/**
 * 对话可见性枚举
 */
export enum ConversationVisibility {
  PRIVATE = 'private',        // 私密 - 仅创建者可见
  PUBLIC = 'public'           // 公开 - 所有登录用户可见
}

/**
 * 消息角色枚举
 */
export enum MessageRole {
  USER = 'user',              // 用户消息
  ASSISTANT = 'assistant',    // AI 助手消息
  SYSTEM = 'system'           // 系统消息
}

/**
 * 工具调用记录接口
 */
export interface ToolCall {
  toolName: string;           // 工具名称
  parameters: Record<string, any>;  // 工具参数
  result?: any;               // 工具执行结果
  timestamp: Date;            // 调用时间
}

/**
 * 消息元数据接口
 */
export interface MessageMetadata {
  toolCalls?: ToolCall[];     // 工具调用记录
  codeChanges?: CodeChange[]; // 代码变更
  thinking?: string;          // AI 思考过程
  isQuestion?: boolean;       // 是否为询问
  questionOptions?: string[]; // 问题选项
  requiresResponse?: boolean; // 是否需要用户响应
  references?: string[];      // 引用的消息或文件 ID
  isInvalid?: boolean;        // 是否已失效(如代码变更被回滚)
  gitBranch?: string;         // 关联的 Git 分支
  mrUrl?: string;             // 关联的 MR URL
  operationDenied?: {         // 操作被拒绝的信息
    operation: OperationType;
    reason: string;
  };
}

/**
 * 对话消息接口
 */
export interface ConversationMessage {
  id: string;                 // 消息 ID
  sessionId: string;          // 所属会话 ID
  role: MessageRole;          // 消息角色
  content: string;            // 消息内容
  metadata?: MessageMetadata; // 元数据
  timestamp: Date;            // 时间戳
  parentMessageId?: string;   // 父消息 ID (用于分支)
}

/**
 * 项目信息接口
 */
export interface ProjectInfo {
  projectId: string;          // 项目ID（必填）
  projectName: string;        // 项目名称（必填）
  gitRepositoryUrl: string;   // Git仓库URL（必填）
  workDir: string;            // 当前活跃的工作目录（可能是 worktree）
  worktreePath?: string;      // 对话 worktree 路径（编辑模式专用）
  mainRepoDir?: string;       // 项目主仓库目录（用于共享 node_modules）
  gitBranch?: string;         // Git 分支
  relevantFiles?: string[];   // 相关文件
}

/**
 * 预览状态枚举
 */
export enum PreviewStatus {
  BUILDING = 'building',      // 构建中
  RUNNING = 'running',        // 运行中
  STOPPED = 'stopped',        // 已停止
  ERROR = 'error'             // 错误
}

/**
 * 端口映射接口
 */
export interface PortMapping {
  host: number;               // 主机端口
  container: number;          // 容器端口
  service: string;            // 服务名称
}

/**
 * 预览信息接口
 */
export interface PreviewInfo {
  url: string;                // 预览 URL
  containerId: string;        // 容器 ID
  imageId?: string;           // 镜像 ID
  imageName?: string;         // 镜像名称
  branchName: string;         // Git 分支名
  deployedAt: Date;           // 部署时间
  status: PreviewStatus;      // 预览状态
  ports?: PortMapping[];      // 端口映射信息
  isRunning?: boolean;        // 容器是否运行中
  accessUrl?: string;         // 实际访问地址（可能与 url 不同）
}

/**
 * 对话上下文接口
 */
export interface ConversationContext {
  projectInfo: ProjectInfo;   // 项目信息
  taskDescription: string;    // 任务描述
  messageHistory: string[];   // 消息历史 ID 列表
  variables: Record<string, any>; // 上下文变量
  mode: ConversationMode;     // 对话模式
  gitBranch?: string;         // 编辑模式下创建的 Git 分支
  mrUrl?: string;             // 编辑模式下创建的 MR URL
  previewInfo?: PreviewInfo;  // 预览信息
}

/**
 * 对话会话接口
 */
export interface ConversationSession {
  id: string;                 // 会话 ID（对话 ID）
  userId?: string;            // 用户 ID
  status: ConversationStatus; // 会话状态
  visibility: ConversationVisibility; // 可见性
  context: ConversationContext; // 会话上下文
  createdAt: Date;            // 创建时间
  updatedAt: Date;            // 更新时间
  completedAt?: Date;         // 完成时间
  error?: string;             // 错误信息
  title?: string;             // 对话标题（用于展示）
}

/**
 * AI 响应接口
 */
export interface AIResponse {
  content: string;            // 响应内容
  metadata?: MessageMetadata; // 元数据
  shouldPause?: boolean;      // 是否应该暂停等待用户输入
}

/**
 * 操作验证结果接口
 */
export interface ValidationResult {
  allowed: boolean;           // 是否允许
  reason?: string;            // 拒绝原因
}

/**
 * Merge Request 信息接口
 */
export interface MergeRequestInfo {
  mrId: number;               // MR ID
  webUrl: string;             // MR URL
  sourceBranch: string;       // 源分支
  targetBranch: string;       // 目标分支
  title: string;              // MR 标题
}

// ==================== Neovate 会话管理类型定义 ====================

/**
 * Neovate 会话信息接口
 */
export interface NeovateSessionInfo {
  taskId: string;              // 任务 ID
  neovateSessionId: string;    // Neovate 会话 ID
  workDir: string;             // 工作目录
  createdAt: Date;             // 创建时间
  lastUsedAt: Date;            // 最后使用时间
}

// ==================== 预览相关类型定义 ====================

/**
 * 部署信息接口
 */
export interface DeploymentInfo {
  buildTime: number;           // 构建耗时（秒）
  startTime: number;           // 启动耗时（秒）
  totalTime: number;           // 总耗时（秒）
  ports: PortMapping[];        // 端口映射信息
}

/**
 * 预览结果接口
 */
export interface PreviewResult {
  success: boolean;            // 是否成功
  previewUrl?: string;         // 预览 URL
  containerId?: string;        // 容器 ID
  deploymentInfo?: DeploymentInfo; // 部署信息
  error?: string;              // 错误信息
}

/**
 * 健康检查结果接口
 */
export interface HealthCheckResult {
  healthy: boolean;            // 是否健康
  lastCheck: Date;             // 最后检查时间
  details?: string;            // 详细信息
}

/**
 * 预览状态响应接口
 */
export interface PreviewStatusResponse {
  status: PreviewStatus;       // 预览状态
  url?: string;                // 预览 URL
  containerId?: string;        // 容器 ID
  imageId?: string;            // 镇像 ID
  imageName?: string;          // 镇像名称
  branchName?: string;         // Git 分支名
  deployedAt?: Date;           // 部署时间
  isRunning?: boolean;         // 是否运行中
  accessUrl?: string;          // 访问地址
  healthCheck?: HealthCheckResult; // 健康检查结果
}

/**
 * 操作结果接口
 */
export interface OperationResult {
  success: boolean;            // 是否成功
  message: string;             // 消息
  error?: string;              // 错误信息
}

// ==================== 项目管理相关类型定义 ====================

// 导入数据库类型
import type { projects, users } from '../db/schema';
export type Project = typeof projects.$inferSelect;
export type User = typeof users.$inferSelect;

// 移除复杂的角色枚举，简化权限控制

/**
 * 创建项目请求接口
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  gitRepositoryUrl: string;
  gitlab?: {
    projectId: string;
    url: string;
  };
}

/**
 * 更新项目请求接口
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  gitRepositoryUrl?: string;
  gitlab?: {
    projectId?: string;
    url?: string;
  };
  isActive?: boolean;
}

/**
 * 项目过滤器接口
 */
export interface ProjectFilters {
  isActive?: boolean;
  search?: string; // 搜索项目名称或描述
}

// 移除成员管理相关接口

/**
 * 项目结果接口
 */
export interface ProjectResult extends OperationResult {
  project?: Project;
}

/**
 * 项目列表结果接口
 */
export interface ProjectListResult extends OperationResult {
  projects?: Project[];
  total?: number;
}

// 移除成员列表结果接口

// 移除权限验证结果接口

/**
 * 仓库验证结果接口
 */
export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

/**
 * 仓库克隆结果接口
 */
export interface CloneResult extends OperationResult {
  clonePath?: string;
}

/**
 * 仓库状态枚举
 */
export enum RepositoryStatus {
  PENDING = 'pending',      // 等待克隆
  CLONING = 'cloning',      // 正在克隆
  SUCCESS = 'success',      // 克隆成功
  FAILED = 'failed',        // 克隆失败
  UPDATING = 'updating'     // 正在更新
}

/**
 * 仓库信息接口
 */
export interface RepositoryInfo {
  exists: boolean;
  branch: string;
  lastCommit?: {
    hash: string;
    message: string;
    author: string;
    date: Date;
  };
  status: RepositoryStatus;
  error?: string;
}

/**
 * 仓库更新结果接口
 */
export interface UpdateResult extends OperationResult {
  newCommits?: number;
}
