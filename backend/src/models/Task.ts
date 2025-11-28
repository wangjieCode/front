import { v4 as uuidv4 } from 'uuid';
import { Task, TaskStatus, TaskType } from '../types';
import { validatePrompt } from '../utils/validation';

/**
 * 创建新任务
 * @param prompt 用户输入的提示词
 * @param type 任务类型（默认为 CODE_CHANGE）
 * @returns 新创建的任务对象
 * @throws {ValidationError} 如果提示词无效
 */
export function createTask(prompt: string, type: TaskType = TaskType.CODE_CHANGE): Task {
  // 验证提示词
  validatePrompt(prompt);

  const taskId = uuidv4();
  const timestamp = Date.now();
  
  // 仅为 CODE_CHANGE 类型生成分支名称
  const branchName = type === TaskType.CODE_CHANGE 
    ? `feature/task-${taskId.substring(0, 8)}-${timestamp}`
    : undefined;

  return {
    id: taskId,
    prompt: prompt.trim(),
    type,
    status: TaskStatus.PENDING,
    branchName,
    createdAt: new Date(),
  };
}

/**
 * 验证任务状态转换是否合法
 * @param currentStatus 当前状态
 * @param newStatus 新状态
 * @returns 如果转换合法返回 true
 */
export function isValidStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus
): boolean {
  // 定义合法的状态转换
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    [TaskStatus.PENDING]: [TaskStatus.RUNNING],
    [TaskStatus.RUNNING]: [TaskStatus.SUCCESS, TaskStatus.FAILED],
    [TaskStatus.SUCCESS]: [], // 终态，不能转换
    [TaskStatus.FAILED]: [], // 终态，不能转换
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * 更新任务状态
 * @param task 要更新的任务
 * @param newStatus 新状态
 * @throws {Error} 如果状态转换不合法
 */
export function updateTaskStatus(task: Task, newStatus: TaskStatus): void {
  if (!isValidStatusTransition(task.status, newStatus)) {
    throw new Error(
      `非法的状态转换: ${task.status} -> ${newStatus}`
    );
  }

  task.status = newStatus;

  // 如果任务完成或失败，记录完成时间
  if (newStatus === TaskStatus.SUCCESS || newStatus === TaskStatus.FAILED) {
    task.completedAt = new Date();
  }
}

/**
 * 设置任务错误信息
 * @param task 任务对象
 * @param error 错误信息
 */
export function setTaskError(task: Task, error: string): void {
  task.error = error;
  task.status = TaskStatus.FAILED;
  task.completedAt = new Date();
}

/**
 * 设置任务的 MR URL
 * @param task 任务对象
 * @param mrUrl Merge Request URL
 */
export function setTaskMRUrl(task: Task, mrUrl: string): void {
  task.mrUrl = mrUrl;
}

/**
 * 设置任务结果（用于查询类任务）
 * @param task 任务对象
 * @param result 查询结果
 */
export function setTaskResult(task: Task, result: string): void {
  task.result = result;
}
