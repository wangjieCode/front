import { createTask, updateTaskStatus, isValidStatusTransition, setTaskError } from '../Task';
import { TaskStatus } from '../../types';
import { ValidationError } from '../../utils/validation';

describe('Task Model', () => {
  describe('createTask', () => {
    it('应该创建一个有效的任务', () => {
      const prompt = '修改登录按钮颜色为蓝色';
      const task = createTask(prompt);

      expect(task.id).toBeDefined();
      expect(task.prompt).toBe(prompt);
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.branchName).toBeDefined();
      expect(task.branchName).toMatch(/^feature\/task-/);
      expect(task.createdAt).toBeInstanceOf(Date);
    });

    it('应该为不同任务生成唯一的 ID', () => {
      const task1 = createTask('任务 1');
      const task2 = createTask('任务 2');

      expect(task1.id).not.toBe(task2.id);
    });

    it('应该为不同任务生成唯一的分支名称', () => {
      const task1 = createTask('任务 1');
      const task2 = createTask('任务 2');

      expect(task1.branchName).not.toBe(task2.branchName);
    });

    it('应该拒绝空提示词', () => {
      expect(() => createTask('')).toThrow(ValidationError);
      expect(() => createTask('')).toThrow('提示词不能为空');
    });

    it('应该拒绝仅包含空白字符的提示词', () => {
      expect(() => createTask('   ')).toThrow(ValidationError);
      expect(() => createTask('\t\n')).toThrow(ValidationError);
    });

    it('应该拒绝超长提示词', () => {
      const longPrompt = 'a'.repeat(5001);
      expect(() => createTask(longPrompt)).toThrow(ValidationError);
      expect(() => createTask(longPrompt)).toThrow('提示词长度不能超过 5000 字符');
    });

    it('应该修剪提示词的前后空白', () => {
      const task = createTask('  测试提示词  ');
      expect(task.prompt).toBe('测试提示词');
    });
  });

  describe('isValidStatusTransition', () => {
    it('应该允许从 PENDING 到 RUNNING', () => {
      expect(isValidStatusTransition(TaskStatus.PENDING, TaskStatus.RUNNING)).toBe(true);
    });

    it('应该允许从 RUNNING 到 SUCCESS', () => {
      expect(isValidStatusTransition(TaskStatus.RUNNING, TaskStatus.SUCCESS)).toBe(true);
    });

    it('应该允许从 RUNNING 到 FAILED', () => {
      expect(isValidStatusTransition(TaskStatus.RUNNING, TaskStatus.FAILED)).toBe(true);
    });

    it('应该拒绝从 PENDING 到 SUCCESS', () => {
      expect(isValidStatusTransition(TaskStatus.PENDING, TaskStatus.SUCCESS)).toBe(false);
    });

    it('应该拒绝从 RUNNING 到 PENDING', () => {
      expect(isValidStatusTransition(TaskStatus.RUNNING, TaskStatus.PENDING)).toBe(false);
    });

    it('应该拒绝从 SUCCESS 到任何状态', () => {
      expect(isValidStatusTransition(TaskStatus.SUCCESS, TaskStatus.PENDING)).toBe(false);
      expect(isValidStatusTransition(TaskStatus.SUCCESS, TaskStatus.RUNNING)).toBe(false);
      expect(isValidStatusTransition(TaskStatus.SUCCESS, TaskStatus.FAILED)).toBe(false);
    });

    it('应该拒绝从 FAILED 到任何状态', () => {
      expect(isValidStatusTransition(TaskStatus.FAILED, TaskStatus.PENDING)).toBe(false);
      expect(isValidStatusTransition(TaskStatus.FAILED, TaskStatus.RUNNING)).toBe(false);
      expect(isValidStatusTransition(TaskStatus.FAILED, TaskStatus.SUCCESS)).toBe(false);
    });
  });

  describe('updateTaskStatus', () => {
    it('应该更新任务状态', () => {
      const task = createTask('测试任务');
      updateTaskStatus(task, TaskStatus.RUNNING);

      expect(task.status).toBe(TaskStatus.RUNNING);
    });

    it('应该在任务成功时设置完成时间', () => {
      const task = createTask('测试任务');
      updateTaskStatus(task, TaskStatus.RUNNING);
      updateTaskStatus(task, TaskStatus.SUCCESS);

      expect(task.completedAt).toBeInstanceOf(Date);
    });

    it('应该在任务失败时设置完成时间', () => {
      const task = createTask('测试任务');
      updateTaskStatus(task, TaskStatus.RUNNING);
      updateTaskStatus(task, TaskStatus.FAILED);

      expect(task.completedAt).toBeInstanceOf(Date);
    });

    it('应该拒绝非法的状态转换', () => {
      const task = createTask('测试任务');
      
      expect(() => updateTaskStatus(task, TaskStatus.SUCCESS)).toThrow('非法的状态转换');
    });
  });

  describe('setTaskError', () => {
    it('应该设置错误信息并标记任务为失败', () => {
      const task = createTask('测试任务');
      const errorMessage = 'SSH 连接失败';
      
      setTaskError(task, errorMessage);

      expect(task.error).toBe(errorMessage);
      expect(task.status).toBe(TaskStatus.FAILED);
      expect(task.completedAt).toBeInstanceOf(Date);
    });
  });
});
