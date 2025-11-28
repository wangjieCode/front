import { Task, LogEntry, TaskStatus, TaskType } from '../types';
import { createTask, updateTaskStatus as updateStatus, setTaskError, setTaskMRUrl, setTaskResult } from '../models/Task';
import { createLogEntry } from '../models/LogEntry';
import { validateTaskId } from '../utils/validation';

/**
 * 任务管理器类
 * 负责任务的生命周期管理、状态跟踪和日志管理（内存存储）
 */
export class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();

  /**
   * 创建新任务
   * @param prompt 用户输入的提示词
   * @param type 任务类型（默认为 CODE_CHANGE）
   * @returns 创建的任务对象
   */
  createTask(prompt: string, type: TaskType = TaskType.CODE_CHANGE): Task {
    const task = createTask(prompt, type);
    this.tasks.set(task.id, task);
    this.logs.set(task.id, []);
    
    // 添加任务创建日志
    const typeLabel = type === TaskType.CODE_CHANGE ? '编辑模式' : '只读模式';
    this.addLog(task.id, createLogEntry(
      'info' as any,
      'system',
      `任务已创建 (${typeLabel}): ${task.id}`
    ));

    return task;
  }

  /**
   * 获取任务
   * @param taskId 任务 ID
   * @returns 任务对象，如果不存在返回 undefined
   */
  getTask(taskId: string): Task | undefined {
    validateTaskId(taskId);
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   * @returns 任务数组，按创建时间倒序排列
   */
  getTasks(): Task[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * 更新任务状态
   * @param taskId 任务 ID
   * @param newStatus 新状态
   * @throws {Error} 如果任务不存在或状态转换不合法
   */
  updateTaskStatus(taskId: string, newStatus: TaskStatus): void {
    validateTaskId(taskId);
    
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    updateStatus(task, newStatus);
    
    // 添加状态变更日志
    this.addLog(taskId, createLogEntry(
      'info' as any,
      'system',
      `任务状态更新: ${newStatus}`
    ));
  }

  /**
   * 设置任务错误
   * @param taskId 任务 ID
   * @param error 错误信息
   */
  setTaskError(taskId: string, error: string): void {
    validateTaskId(taskId);
    
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    setTaskError(task, error);
    
    // 添加错误日志
    this.addLog(taskId, createLogEntry(
      'error' as any,
      'system',
      `任务失败: ${error}`
    ));
  }

  /**
   * 设置任务的 MR URL
   * @param taskId 任务 ID
   * @param mrUrl Merge Request URL
   */
  setTaskMRUrl(taskId: string, mrUrl: string): void {
    validateTaskId(taskId);
    
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    setTaskMRUrl(task, mrUrl);
    
    // 添加 MR 创建日志
    this.addLog(taskId, createLogEntry(
      'info' as any,
      'gitlab',
      `Merge Request 已创建: ${mrUrl}`
    ));
  }

  /**
   * 设置任务结果（用于查询类任务）
   * @param taskId 任务 ID
   * @param result 查询结果
   */
  setTaskResult(taskId: string, result: string): void {
    validateTaskId(taskId);
    
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    setTaskResult(task, result);
  }

  /**
   * 添加日志
   * @param taskId 任务 ID
   * @param log 日志条目
   */
  addLog(taskId: string, log: LogEntry): void {
    validateTaskId(taskId);
    
    const taskLogs = this.logs.get(taskId);
    if (!taskLogs) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    // 确保日志时间戳单调递增
    if (taskLogs.length > 0) {
      const lastLog = taskLogs[taskLogs.length - 1];
      if (log.timestamp < lastLog.timestamp) {
        // 如果新日志的时间戳早于最后一条日志，调整为当前时间
        log.timestamp = new Date();
      }
    }

    taskLogs.push(log);
  }

  /**
   * 获取任务日志
   * @param taskId 任务 ID
   * @returns 日志数组
   */
  getLogs(taskId: string): LogEntry[] {
    validateTaskId(taskId);
    
    const logs = this.logs.get(taskId);
    if (!logs) {
      throw new Error(`任务不存在: ${taskId}`);
    }

    return [...logs]; // 返回副本，防止外部修改
  }

  /**
   * 删除任务（包括日志）
   * @param taskId 任务 ID
   * @returns 如果删除成功返回 true
   */
  deleteTask(taskId: string): boolean {
    validateTaskId(taskId);
    
    const taskDeleted = this.tasks.delete(taskId);
    const logsDeleted = this.logs.delete(taskId);
    
    return taskDeleted && logsDeleted;
  }

  /**
   * 清空所有任务和日志
   */
  clear(): void {
    this.tasks.clear();
    this.logs.clear();
  }

  /**
   * 获取任务统计信息
   * @returns 统计信息对象
   */
  getStats(): {
    total: number;
    pending: number;
    running: number;
    success: number;
    failed: number;
  } {
    const tasks = Array.from(this.tasks.values());
    
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === TaskStatus.PENDING).length,
      running: tasks.filter(t => t.status === TaskStatus.RUNNING).length,
      success: tasks.filter(t => t.status === TaskStatus.SUCCESS).length,
      failed: tasks.filter(t => t.status === TaskStatus.FAILED).length,
    };
  }

  /**
   * 检查任务是否存在
   * @param taskId 任务 ID
   * @returns 如果存在返回 true
   */
  hasTask(taskId: string): boolean {
    return this.tasks.has(taskId);
  }

  /**
   * 获取正在运行的任务
   * @returns 正在运行的任务数组
   */
  getRunningTasks(): Task[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === TaskStatus.RUNNING);
  }

  /**
   * 获取已完成的任务（成功或失败）
   * @returns 已完成的任务数组
   */
  getCompletedTasks(): Task[] {
    return Array.from(this.tasks.values())
      .filter(task => 
        task.status === TaskStatus.SUCCESS || 
        task.status === TaskStatus.FAILED
      )
      .sort((a, b) => {
        const aTime = a.completedAt?.getTime() || 0;
        const bTime = b.completedAt?.getTime() || 0;
        return bTime - aTime;
      });
  }
}
