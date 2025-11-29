/**
 * 测试 DrizzleConversationStorage 基本功能
 */
import { initializeDatabase, closeDatabase } from '../src/db/init';
import { DrizzleConversationStorage } from '../src/storage/DrizzleConversationStorage';
import { randomUUID } from 'crypto';

async function testStorage() {
  console.log('🧪 测试 DrizzleConversationStorage\n');

  try {
    // 1. 初始化数据库
    console.log('1️⃣  初始化数据库连接...');
    const initialized = await initializeDatabase();
    if (!initialized) {
      throw new Error('数据库初始化失败');
    }
    console.log('✓ 数据库连接成功\n');

    // 2. 创建存储实例
    const storage = new DrizzleConversationStorage();
    console.log('2️⃣  创建存储实例...');
    console.log('✓ 存储实例创建成功\n');

    // 3. 测试会话管理
    console.log('3️⃣  测试会话管理...');
    const sessionId = 'test-agent-session-' + Date.now();
    const conversationId = randomUUID();

    await storage.saveSession({
      id: conversationId,
      sessionId,
      taskId: 'test-task-123',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('✓ 会话保存成功');

    const loadedSession = await storage.loadSessionByAgentSessionId(sessionId);
    if (!loadedSession) {
      throw new Error('会话加载失败');
    }
    console.log('✓ 会话加载成功:', loadedSession.sessionId);

    const sessions = await storage.listSessions();
    console.log('✓ 会话列表查询成功，共', sessions.length, '个会话\n');

    // 4. 测试分支管理
    console.log('4️⃣  测试分支管理...');
    const branchId = randomUUID();
    await storage.saveBranch(conversationId, {
      id: branchId,
      name: 'main',
      isActive: true,
    });
    console.log('✓ 分支保存成功');

    const branches = await storage.listBranches(conversationId);
    console.log('✓ 分支列表查询成功，共', branches.length, '个分支\n');

    // 5. 测试上下文管理
    console.log('5️⃣  测试上下文管理...');
    await storage.saveContext(conversationId, {
      workDir: '/test/project',
      gitBranch: 'main',
      taskDescription: '测试任务',
      currentBranchId: branchId,
      relevantFiles: ['test.ts'],
      variables: { test: 'value' },
    });
    console.log('✓ 上下文保存成功');

    const context = await storage.loadContext(conversationId);
    if (!context) {
      throw new Error('上下文加载失败');
    }
    console.log('✓ 上下文加载成功:', context.workDir, '\n');

    // 6. 测试消息管理
    console.log('6️⃣  测试消息管理...');
    const messageId = randomUUID();
    await storage.saveMessage({
      id: messageId,
      conversationId,
      branchId,
      role: 'user',
      content: 'Hello, this is a test message!',
      isComplete: true,
      timestamp: new Date(),
    });
    console.log('✓ 消息保存成功');

    const messages = await storage.loadMessages(conversationId);
    console.log('✓ 消息列表查询成功，共', messages.length, '条消息');

    const messageCount = await storage.getMessageCount(conversationId);
    console.log('✓ 消息计数成功:', messageCount, '条\n');

    // 7. 测试消息元数据
    console.log('7️⃣  测试消息元数据...');
    await storage.saveMessageMetadata(messageId, {
      toolCalls: [{ name: 'test', args: {} }],
      thinking: 'Test thinking',
      isQuestion: false,
    });
    console.log('✓ 元数据保存成功');

    const metadata = await storage.loadMessageMetadata(messageId);
    if (!metadata) {
      throw new Error('元数据加载失败');
    }
    console.log('✓ 元数据加载成功\n');

    // 8. 测试数据完整性验证
    console.log('8️⃣  测试数据完整性验证...');
    const integrity = await storage.validateDataIntegrity(conversationId);
    console.log('✓ 数据完整性:', integrity.valid ? '通过' : '失败');
    if (!integrity.valid) {
      console.log('  问题:', integrity.issues);
    }
    console.log();

    // 9. 测试更新操作
    console.log('9️⃣  测试更新操作...');
    await storage.updateSession(conversationId, {
      status: 'completed',
      completedAt: new Date(),
    });
    console.log('✓ 会话更新成功');

    await storage.updateMessageContent(messageId, 'Updated content', true);
    console.log('✓ 消息内容更新成功\n');

    // 10. 清理测试数据
    console.log('🧹 清理测试数据...');
    await storage.deleteSession(conversationId);
    console.log('✓ 测试数据清理成功\n');

    // 11. 验证删除
    const deletedSession = await storage.loadSession(conversationId);
    if (deletedSession) {
      throw new Error('会话删除失败');
    }
    console.log('✓ 会话已成功删除\n');

    console.log('✅ 所有测试通过！\n');
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    await closeDatabase();
    process.exit(1);
  }

  // 关闭数据库连接
  await closeDatabase();
  process.exit(0);
}

// 运行测试
testStorage().catch((error) => {
  console.error('测试执行错误:', error);
  process.exit(1);
});
