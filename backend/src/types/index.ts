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
  privateKey: string;
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
 * MR 参数接口
 */
export interface MRParams {
  projectId: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
  description: string;
}
