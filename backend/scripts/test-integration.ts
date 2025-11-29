/**
 * 测试 DrizzleConversationStorage 集成
 */

import { initializeDatabase } from '../src/db/init';
import { DrizzleConversationStorage } from '../src/storage/DrizzleConversationStorage';
import { ConversationStorageAdapter } from '../src/storage/ConversationStorageAdapter';
import {
  ConversationSession,
  ConversationMessage,
  ConversationStatus,
  MessageRole,
} from '../src/types';
import { v4 as uuidv4 } from 'uuid';

async function testIntegration() {
  console.log('🧪 开始测试 DrizzleConversationStorage 集成...\n');

  try {
    // 1. 初始化数据库
    console.log('1️⃣  初始化数据库...');
    await initializeDatabase();
    console.log('✅ 数据库初始化成功\n');

    // 2. 创建存储实例
    console.log('2️⃣  创建存储实例...');
    const storage = new DrizzleConversationStorage();
    const adapter = new ConversationStorageAdapter(storage);
    console.log('✅ 存储实例创建成功\n');

    // 3. 创建测试会话
    console.log('3️⃣  创建测试会话...');
    const sessionId = uuidv4();
    const mainBranchId = uuidv4(); // 使用 UUID 作为分支 ID
    const testSession: ConversationSession = {
      id: sessionId,
      taskId: 'test-task-' + Date.now(),
      status: ConversationStatus.PLANNING,
      context: {
        projectInfo: {
          workDir: '/test/workspace',
          gitBranch: 'main',
          relevantFiles: ['test.ts'],
        },
        taskDescription: '测试任务',
        messageHistory: [],
        currentBranchId: mainBranchId,
        branches: [
          {
            id: mainBranchId,
            name: '主分支',
            parentMessageId: '',
            messageIds: [],
            createdAt: new Date(),
            isActive: true,
          },
        ],
        variables: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await adapter.saveSession(testSession);
    console.log(`✅ 会话创建成功: ${sessionId}\n`);

    // 4. 加载会话
    console.log('4️⃣  加载会话...');
    const loadedSession = await adapter.loadSession(sessionId);
    if (!loadedSession) {
      throw new Error('加载会话失败');
    }
    console.log('✅ 会话加载成功');
    console.log(`   - ID: ${loadedSession.id}`);
    console.log(`   - 任务ID: ${loadedSession.taskId}`);
    console.log(`   - 状态: ${loadedSession.status}`);
    console.log(`   - 分支数: ${loadedSession.context.branches.length}\n`);

    // 5. 添加消息
    console.log('5️⃣  添加测试消息...');
    const messageId = uuidv4();
    const testMessage: ConversationMessage = {
      id: messageId,
      sessionId: sessionId,
      branchId: mainBranchId, // 使用正确的分支 ID
      role: MessageRole.USER,
      content: '这是一条测试消息',
      timestamp: new Date(),
      metadata: {
        isQuestion: false,
        requiresResponse: true,
      },
    };

    await adapter.saveMessage(testMessage);
    console.log(`✅ 消息添加成功: ${messageId}\n`);

    // 6. 加载消息
    console.log('6️⃣  加载消息...');
    const messages = await adapter.loadMessages(sessionId);
    console.log(`✅ 加载了 ${messages.length} 条消息`);
    if (messages.length > 0) {
      console.log(`   - 第一条消息: ${messages[0].content.substring(0, 30)}...\n`);
    }

    // 7. 列出所有会话
    console.log('7️⃣  列出所有会话...');
    const sessions = await adapter.listSessions();
    console.log(`✅ 找到 ${sessions.length} 个会话\n`);

    // 8. 清理测试数据
    console.log('8️⃣  清理测试数据...');
    await adapter.deleteSession(sessionId);
    console.log('✅ 测试数据清理成功\n');

    console.log('🎉 所有测试通过！DrizzleConversationStorage 集成正常工作。\n');
  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testIntegration()
  .then(() => {
    console.log('✅ 测试完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ 测试异常:', error);
    process.exit(1);
  });
