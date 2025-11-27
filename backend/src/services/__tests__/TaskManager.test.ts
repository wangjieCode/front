import { TaskManager } from '../TaskManager';
import { TaskStatus, LogLevel } from '../../types';
import { ValidationError } from '../../utils/validation';
import { createLogEntry } from '../../models/LogEntry';

describe('TaskManager', () => {
  let manager: TaskManager;

  beforeEach(() => {
    manager = new TaskManager();
  });

  describe('createTask', () => {
    it('应该创建一个新任务', () => {
      const prompt = '修改登录按钮颜色为蓝色';
      const task = manager.createTask(prompt);

      expect(task.id).toBeDefined();
      expect(task.prompt).toBe(prompt);
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.branchName).toBeDefined();
    });

    it('应该为每个任务创建日志存储', () => {
      const task = manager.createTask('测试任务');
      const logs = manager.getLogs(task.id);

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0); // 应该有创建日志
    });

    it('应该为不同任务生成唯一 ID', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');

      expect(task1.id).not.toBe(task2.id);
    });

    it('应该拒绝空提示词', () => {
      expect(() => manager.createTask('')).toThrow(ValidationError);
    });
  });

  describe('getTask', () => {
    it('应该返回存在的任务', () => {
      const created = manager.createTask('测试任务');
      const retrieved = manager.getTask(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('应该对不存在的任务返回 undefined', () => {
      const task = manager.getTask('non-existent-id');
      expect(task).toBeUndefined();
    });

    it('应该拒绝空任务 ID', () => {
      expect(() => manager.getTask('')).toThrow(ValidationError);
    });
  });

  describe('getTasks', () => {
    it('应该返回所有任务', () => {
      manager.createTask('任务 1');
      manager.createTask('任务 2');
      manager.createTask('任务 3');

      const tasks = manager.getTasks();
      expect(tasks.length).toBe(3);
    });

    it('应该按创建时间倒序排列', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');
      const task3 = manager.createTask('任务 3');

      const tasks = manager.getTasks();
      expect(tasks[0].id).toBe(task3.id);
      expect(tasks[1].id).toBe(task2.id);
      expect(tasks[2].id).toBe(task1.id);
    });

    it('应该在没有任务时返回空数组', () => {
      const tasks = manager.getTasks();
      expect(tasks).toEqual([]);
    });
  });

  describe('updateTaskStatus', () => {
    it('应该更新任务状态', () => {
      const task = manager.createTask('测试任务');
      manager.updateTaskStatus(task.id, TaskStatus.RUNNING);

      const updated = manager.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.RUNNING);
    });

    it('应该添加状态变更日志', () => {
      const task = manager.createTask('测试任务');
      const logsBefore = manager.getLogs(task.id).length;
      
      manager.updateTaskStatus(task.id, TaskStatus.RUNNING);
      
      const logsAfter = manager.getLogs(task.id).length;
      expect(logsAfter).toBeGreaterThan(logsBefore);
    });

    it('应该拒绝非法的状态转换', () => {
      const task = manager.createTask('测试任务');
      
      expect(() => manager.updateTaskStatus(task.id, TaskStatus.SUCCESS))
        .toThrow('非法的状态转换');
    });

    it('应该在任务不存在时抛出错误', () => {
      expect(() => manager.updateTaskStatus('non-existent', TaskStatus.RUNNING))
        .toThrow('任务不存在');
    });
  });

  describe('setTaskError', () => {
    it('应该设置任务错误并标记为失败', () => {
      const task = manager.createTask('测试任务');
      const errorMsg = 'SSH 连接失败';
      
      manager.setTaskError(task.id, errorMsg);
      
      const updated = manager.getTask(task.id);
      expect(updated?.error).toBe(errorMsg);
      expect(updated?.status).toBe(TaskStatus.FAILED);
    });

    it('应该添加错误日志', () => {
      const task = manager.createTask('测试任务');
      manager.setTaskError(task.id, '测试错误');
      
      const logs = manager.getLogs(task.id);
      const errorLog = logs.find(log => log.message.includes('测试错误'));
      expect(errorLog).toBeDefined();
    });
  });

  describe('setTaskMRUrl', () => {
    it('应该设置 MR URL', () => {
      const task = manager.createTask('测试任务');
      const mrUrl = 'https://gitlab.com/project/merge_requests/1';
      
      manager.setTaskMRUrl(task.id, mrUrl);
      
      const updated = manager.getTask(task.id);
      expect(updated?.mrUrl).toBe(mrUrl);
    });

    it('应该添加 MR 创建日志', () => {
      const task = manager.createTask('测试任务');
      const mrUrl = 'https://gitlab.com/project/merge_requests/1';
      
      manager.setTaskMRUrl(task.id, mrUrl);
      
      const logs = manager.getLogs(task.id);
      const mrLog = logs.find(log => log.message.includes('Merge Request'));
      expect(mrLog).toBeDefined();
    });
  });

  describe('addLog', () => {
    it('应该添加日志条目', () => {
      const task = manager.createTask('测试任务');
      const logsBefore = manager.getLogs(task.id).length;
      
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '测试日志'));
      
      const logsAfter = manager.getLogs(task.id).length;
      expect(logsAfter).toBe(logsBefore + 1);
    });

    it('应该确保日志时间戳单调递增', () => {
      const task = manager.createTask('测试任务');
      
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '日志 1'));
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '日志 2'));
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '日志 3'));
      
      const logs = manager.getLogs(task.id);
      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].timestamp.getTime())
          .toBeGreaterThanOrEqual(logs[i - 1].timestamp.getTime());
      }
    });

    it('应该在任务不存在时抛出错误', () => {
      expect(() => manager.addLog('non-existent', createLogEntry(LogLevel.INFO, 'test', 'test')))
        .toThrow('任务不存在');
    });
  });

  describe('getLogs', () => {
    it('应该返回任务的所有日志', () => {
      const task = manager.createTask('测试任务');
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '日志 1'));
      manager.addLog(task.id, createLogEntry(LogLevel.INFO, 'test', '日志 2'));
      
      const logs = manager.getLogs(task.id);
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    it('应该返回日志副本，防止外部修改', () => {
      const task = manager.createTask('测试任务');
      const logs1 = manager.getLogs(task.id);
      const logs2 = manager.getLogs(task.id);
      
      expect(logs1).not.toBe(logs2); // 不是同一个引用
      expect(logs1).toEqual(logs2); // 但内容相同
    });

    it('应该在任务不存在时抛出错误', () => {
      expect(() => manager.getLogs('non-existent')).toThrow('任务不存在');
    });
  });

  describe('deleteTask', () => {
    it('应该删除任务和日志', () => {
      const task = manager.createTask('测试任务');
      const deleted = manager.deleteTask(task.id);
      
      expect(deleted).toBe(true);
      expect(manager.getTask(task.id)).toBeUndefined();
    });

    it('应该在任务不存在时返回 false', () => {
      const deleted = manager.deleteTask('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('应该清空所有任务和日志', () => {
      manager.createTask('任务 1');
      manager.createTask('任务 2');
      manager.createTask('任务 3');
      
      manager.clear();
      
      expect(manager.getTasks().length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');
      const task3 = manager.createTask('任务 3');
      
      manager.updateTaskStatus(task1.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task2.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task2.id, TaskStatus.SUCCESS);
      
      const stats = manager.getStats();
      
      expect(stats.total).toBe(3);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.success).toBe(1);
      expect(stats.failed).toBe(0);
    });
  });

  describe('hasTask', () => {
    it('应该正确判断任务是否存在', () => {
      const task = manager.createTask('测试任务');
      
      expect(manager.hasTask(task.id)).toBe(true);
      expect(manager.hasTask('non-existent')).toBe(false);
    });
  });

  describe('getRunningTasks', () => {
    it('应该返回所有正在运行的任务', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');
      const task3 = manager.createTask('任务 3');
      
      manager.updateTaskStatus(task1.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task2.id, TaskStatus.RUNNING);
      
      const runningTasks = manager.getRunningTasks();
      expect(runningTasks.length).toBe(2);
    });
  });

  describe('getCompletedTasks', () => {
    it('应该返回所有已完成的任务', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');
      const task3 = manager.createTask('任务 3');
      
      manager.updateTaskStatus(task1.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task1.id, TaskStatus.SUCCESS);
      manager.updateTaskStatus(task2.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task2.id, TaskStatus.FAILED);
      
      const completedTasks = manager.getCompletedTasks();
      expect(completedTasks.length).toBe(2);
    });

    it('应该按完成时间倒序排列', () => {
      const task1 = manager.createTask('任务 1');
      const task2 = manager.createTask('任务 2');
      
      manager.updateTaskStatus(task1.id, TaskStatus.RUNNING);
      manager.updateTaskStatus(task1.id, TaskStatus.SUCCESS);
      
      // 稍微延迟以确保时间戳不同
      setTimeout(() => {
        manager.updateTaskStatus(task2.id, TaskStatus.RUNNING);
        manager.updateTaskStatus(task2.id, TaskStatus.SUCCESS);
      }, 10);
      
      const completedTasks = manager.getCompletedTasks();
      if (completedTasks.length === 2) {
        const time1 = completedTasks[0].completedAt?.getTime() || 0;
        const time2 = completedTasks[1].completedAt?.getTime() || 0;
        expect(time1).toBeGreaterThanOrEqual(time2);
      }
    });
  });
});
