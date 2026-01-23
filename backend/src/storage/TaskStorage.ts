import * as fs from 'fs/promises';
import * as path from 'path';
import { Task, LogEntry } from '../types';
import dayjs from 'dayjs';

/**
 * 任务存储接口
 */
export interface ITaskStorage {
  saveTask(task: Task): Promise<void>;
  loadTask(taskId: string): Promise<Task | null>;
  listTasks(): Promise<Task[]>;
  deleteTask(taskId: string): Promise<void>;
  saveLogs(taskId: string, logs: LogEntry[]): Promise<void>;
  loadLogs(taskId: string): Promise<LogEntry[]>;
}

/**
 * 基于文件系统的任务存储实现
 */
export class FileSystemTaskStorage implements ITaskStorage {
  private baseDir: string;

  constructor(baseDir: string = 'backend/data/tasks') {
    this.baseDir = baseDir;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      // 目录已存在
    }
  }

  private getTaskDir(taskId: string): string {
    return path.join(this.baseDir, taskId);
  }

  private getTaskFilePath(taskId: string): string {
    return path.join(this.getTaskDir(taskId), 'task.json');
  }

  private getLogsFilePath(taskId: string): string {
    return path.join(this.getTaskDir(taskId), 'logs.json');
  }

  private getIndexPath(): string {
    return path.join(this.baseDir, 'index.json');
  }

  async saveTask(task: Task): Promise<void> {
    const taskDir = this.getTaskDir(task.id);
    await this.ensureDir(taskDir);

    const taskFilePath = this.getTaskFilePath(task.id);
    await fs.writeFile(taskFilePath, JSON.stringify(task, null, 2), 'utf-8');

    // 更新索引
    await this.updateIndex(task.id);
  }

  async loadTask(taskId: string): Promise<Task | null> {
    try {
      const taskFilePath = this.getTaskFilePath(taskId);
      const data = await fs.readFile(taskFilePath, 'utf-8');
      const task = JSON.parse(data);

      // 转换日期字符串
      task.createdAt = dayjs(task.createdAt).toDate();
      if (task.completedAt) {
        task.completedAt = dayjs(task.completedAt).toDate();
      }

      return task;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async listTasks(): Promise<Task[]> {
    try {
      const indexPath = this.getIndexPath();
      const data = await fs.readFile(indexPath, 'utf-8');
      const taskIds: string[] = JSON.parse(data);

      const tasks: Task[] = [];
      for (const taskId of taskIds) {
        const task = await this.loadTask(taskId);
        if (task) {
          tasks.push(task);
        }
      }

      // 按创建时间倒序排列
      tasks.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return tasks;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    const taskDir = this.getTaskDir(taskId);

    try {
      await fs.rm(taskDir, { recursive: true, force: true });

      // 从索引中移除
      const indexPath = this.getIndexPath();
      try {
        const data = await fs.readFile(indexPath, 'utf-8');
        let taskIds: string[] = JSON.parse(data);
        taskIds = taskIds.filter(id => id !== taskId);
        await fs.writeFile(indexPath, JSON.stringify(taskIds, null, 2), 'utf-8');
      } catch (error) {
        // 索引文件不存在
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async saveLogs(taskId: string, logs: LogEntry[]): Promise<void> {
    const taskDir = this.getTaskDir(taskId);
    await this.ensureDir(taskDir);

    const logsFilePath = this.getLogsFilePath(taskId);
    await fs.writeFile(logsFilePath, JSON.stringify(logs, null, 2), 'utf-8');
  }

  async loadLogs(taskId: string): Promise<LogEntry[]> {
    try {
      const logsFilePath = this.getLogsFilePath(taskId);
      const data = await fs.readFile(logsFilePath, 'utf-8');
      const logs = JSON.parse(data);

      // 转换日期字符串
      return logs.map((log: any) => ({
        ...log,
        timestamp: dayjs(log.timestamp).toDate(),
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async updateIndex(taskId: string): Promise<void> {
    await this.ensureDir(this.baseDir);
    const indexPath = this.getIndexPath();

    let taskIds: string[] = [];
    try {
      const data = await fs.readFile(indexPath, 'utf-8');
      taskIds = JSON.parse(data);
    } catch (error) {
      // 索引文件不存在
    }

    if (!taskIds.includes(taskId)) {
      taskIds.push(taskId);
      await fs.writeFile(indexPath, JSON.stringify(taskIds, null, 2), 'utf-8');
    }
  }
}
