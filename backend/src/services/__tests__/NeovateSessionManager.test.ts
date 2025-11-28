import * as fs from 'fs/promises';
import * as path from 'path';
import { NeovateSessionManager } from '../NeovateSessionManager';

describe('NeovateSessionManager', () => {
  const testBaseDir = 'backend/data/neovate-sessions-test';
  let manager: NeovateSessionManager;

  beforeEach(async () => {
    // 创建测试用的管理器
    manager = new NeovateSessionManager(testBaseDir);
    
    // 清理测试目录
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch (error) {
      // 目录不存在，忽略
    }
  });

  afterEach(async () => {
    // 清理测试目录
    try {
      await fs.rm(testBaseDir, { recursive: true, force: true });
    } catch (error) {
      // 目录不存在，忽略
    }
  });

  describe('saveSessionId and getSessionId', () => {
    it('should save and retrieve session ID', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      // 保存会话 ID
      await manager.saveSessionId(taskId, sessionId, workDir);

      // 获取会话 ID
      const retrievedSessionId = await manager.getSessionId(taskId);

      expect(retrievedSessionId).toBe(sessionId);
    });

    it('should return null for non-existent task', async () => {
      const sessionId = await manager.getSessionId('non-existent-task');
      expect(sessionId).toBeNull();
    });

    it('should update session ID for existing task', async () => {
      const taskId = 'task-123';
      const sessionId1 = 'session-abc';
      const sessionId2 = 'session-xyz';
      const workDir = '/path/to/workspace';

      // 保存第一个会话 ID
      await manager.saveSessionId(taskId, sessionId1, workDir);

      // 更新为第二个会话 ID
      await manager.saveSessionId(taskId, sessionId2, workDir);

      // 获取会话 ID，应该是第二个
      const retrievedSessionId = await manager.getSessionId(taskId);
      expect(retrievedSessionId).toBe(sessionId2);
    });

    it('should preserve createdAt when updating session', async () => {
      const taskId = 'task-123';
      const sessionId1 = 'session-abc';
      const sessionId2 = 'session-xyz';
      const workDir = '/path/to/workspace';

      // 保存第一个会话 ID
      await manager.saveSessionId(taskId, sessionId1, workDir);
      const info1 = await manager.getSessionInfo(taskId);

      // 等待一小段时间
      await new Promise(resolve => setTimeout(resolve, 10));

      // 更新会话 ID
      await manager.saveSessionId(taskId, sessionId2, workDir);
      const info2 = await manager.getSessionInfo(taskId);

      // createdAt 应该保持不变
      expect(info2?.createdAt.getTime()).toBe(info1?.createdAt.getTime());
      // lastUsedAt 应该更新
      expect(info2?.lastUsedAt.getTime()).toBeGreaterThan(info1?.lastUsedAt.getTime() || 0);
    });
  });

  describe('getSessionInfo', () => {
    it('should return complete session info', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      await manager.saveSessionId(taskId, sessionId, workDir);
      const info = await manager.getSessionInfo(taskId);

      expect(info).not.toBeNull();
      expect(info?.taskId).toBe(taskId);
      expect(info?.neovateSessionId).toBe(sessionId);
      expect(info?.workDir).toBe(workDir);
      expect(info?.createdAt).toBeInstanceOf(Date);
      expect(info?.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent task', async () => {
      const info = await manager.getSessionInfo('non-existent-task');
      expect(info).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete session mapping', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      // 保存会话
      await manager.saveSessionId(taskId, sessionId, workDir);

      // 验证会话存在
      let retrievedSessionId = await manager.getSessionId(taskId);
      expect(retrievedSessionId).toBe(sessionId);

      // 删除会话
      await manager.deleteSession(taskId);

      // 验证会话已删除
      retrievedSessionId = await manager.getSessionId(taskId);
      expect(retrievedSessionId).toBeNull();
    });

    it('should not throw error when deleting non-existent session', async () => {
      await expect(manager.deleteSession('non-existent-task')).resolves.not.toThrow();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should clean up sessions older than 24 hours', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      // 保存会话
      await manager.saveSessionId(taskId, sessionId, workDir);

      // 手动修改 lastUsedAt 为 25 小时前
      const sessionFilePath = path.join(testBaseDir, taskId, 'session.json');
      const sessionData = await fs.readFile(sessionFilePath, 'utf-8');
      const sessionInfo = JSON.parse(sessionData);
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 小时前
      sessionInfo.lastUsedAt = oldDate.toISOString();
      await fs.writeFile(sessionFilePath, JSON.stringify(sessionInfo, null, 2), 'utf-8');

      // 执行清理
      const cleanedCount = await manager.cleanupExpiredSessions();

      // 验证会话已被清理
      expect(cleanedCount).toBe(1);
      const retrievedSessionId = await manager.getSessionId(taskId);
      expect(retrievedSessionId).toBeNull();
    });

    it('should not clean up recent sessions', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      // 保存会话
      await manager.saveSessionId(taskId, sessionId, workDir);

      // 执行清理
      const cleanedCount = await manager.cleanupExpiredSessions();

      // 验证会话未被清理
      expect(cleanedCount).toBe(0);
      const retrievedSessionId = await manager.getSessionId(taskId);
      expect(retrievedSessionId).toBe(sessionId);
    });
  });

  describe('cache functionality', () => {
    it('should use cache for repeated reads', async () => {
      const taskId = 'task-123';
      const sessionId = 'session-abc';
      const workDir = '/path/to/workspace';

      // 保存会话
      await manager.saveSessionId(taskId, sessionId, workDir);

      // 第一次读取（从文件）
      const sessionId1 = await manager.getSessionId(taskId);

      // 删除文件（但缓存仍然存在）
      const sessionFilePath = path.join(testBaseDir, taskId, 'session.json');
      await fs.unlink(sessionFilePath);

      // 第二次读取（从缓存）
      const sessionId2 = await manager.getSessionId(taskId);

      // 应该从缓存获取到相同的值
      expect(sessionId2).toBe(sessionId1);
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent saves correctly', async () => {
      const taskId = 'task-123';
      const workDir = '/path/to/workspace';

      // 并发保存多个会话 ID
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          manager.saveSessionId(taskId, `session-${i}`, workDir)
        );
      }

      await Promise.all(promises);

      // 验证最终保存了一个有效的会话 ID
      const sessionId = await manager.getSessionId(taskId);
      expect(sessionId).toMatch(/^session-\d+$/);
    });
  });
});
