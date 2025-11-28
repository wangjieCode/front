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
 * 任务类型
 */
export type TaskType = 'code_change' | 'query';

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
  createdAt: string;
  completedAt?: string;
  error?: string;
}

/**
 * 日志条目接口
 */
export interface LogEntry {
  timestamp: string;
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
 * WebSocket 消息类型
 */
export type WSMessageType = 
  | 'task:status'
  | 'task:log'
  | 'task:codeChange'
  | 'task:completed'
  | 'task:error';

/**
 * WebSocket 消息 Payload 类型
 */
export interface WSMessagePayload {
  taskId: string;
  status?: TaskStatus;
  log?: LogEntry;
  changes?: CodeChange[];
  mrUrl?: string;
  error?: string;
}

/**
 * WebSocket 消息接口
 */
export interface WSMessage {
  type: WSMessageType;
  payload: WSMessagePayload;
}
