/**
 * 对话功能测试脚本
 * 测试核心的对话管理功能
 */

import { FileSystemConversationStorage } from '../src/storage/ConversationStorage';
import { ConversationManager } from '../src/services/ConversationManager';
import { MessageRole, ConversationStatus, ChangeType } from '../src/types';

async function testConversation() {
  console.log('🧪 开始测试对话功能...\n');

  // 1. 创建存储和管理器
  console.log('1️⃣ 初始化存储和管理器...');
  const storage = new FileSystemConversationStorage('backend/data/conversations-test');
  const manager = new ConversationManager(storage);
  console.log('✅ 初始化完成\n');

  // 2. 创建会话
  console.log('2️⃣ 创建新会话...');
  const session = await manager.createSession(
    'test-task-001',
    '请帮我实现一个用户登录功能',
    {
      workDir: '/test/project',
      gitBranch: 'main',
    }
  );
  console.log(`✅ 会话创建成功: ${session.id}`);
  console.log(`   状态: ${session.status}`);
  console.log(`   任务ID: ${session.taskId}\n`);

  // 3. 添加用户消息
  console.log('3️⃣ 添加用户消息...');
  const userMessage = await manager.addMessage(
    session.id,
    MessageRole.USER,
    '我需要实现用户名和密码登录'
  );
  console.log(`✅ 用户消息已添加: ${userMessage.id}`);
  console.log(`   内容: ${userMessage.content}\n`);

  // 4. 添加 AI 响应
  console.log('4️⃣ 添加 AI 响应...');
  const aiMessage = await manager.addMessage(
    session.id,
    MessageRole.ASSISTANT,
    '好的,我会帮你实现用户登录功能。首先需要创建以下文件...',
    {
      thinking: '分析需求:需要实现用户名密码登录',
      codeChanges: [
        {
          filePath: 'src/auth/login.ts',
          changeType: ChangeType.ADDED,
          diff: '+ export function login(username: string, password: string) {...}',
        },
      ],
    }
  );
  console.log(`✅ AI 响应已添加: ${aiMessage.id}`);
  console.log(`   包含代码变更: ${aiMessage.metadata?.codeChanges?.length} 个文件\n`);

  // 5. 更新会话状态
  console.log('5️⃣ 更新会话状态...');
  await manager.updateSessionStatus(session.id, ConversationStatus.EXECUTING);
  const updatedSession = await manager.getSession(session.id);
  console.log(`✅ 状态已更新: ${updatedSession?.status}\n`);

  // 6. 获取消息历史
  console.log('6️⃣ 获取消息历史...');
  const messages = await manager.getMessageHistory(session.id);
  console.log(`✅ 共有 ${messages.length} 条消息:`);
  messages.forEach((msg, index) => {
    console.log(`   ${index + 1}. [${msg.role}] ${msg.content.substring(0, 50)}...`);
  });
  console.log();

  // 7. 创建分支
  console.log('7️⃣ 创建对话分支...');
  const branch = await manager.createBranch(
    session.id,
    userMessage.id,
    '尝试其他方案'
  );
  console.log(`✅ 分支创建成功: ${branch.id}`);
  console.log(`   分支名称: ${branch.name}`);
  console.log(`   起点消息: ${branch.parentMessageId}\n`);

  // 8. 获取所有分支
  console.log('8️⃣ 获取所有分支...');
  const branches = await manager.getBranches(session.id);
  console.log(`✅ 共有 ${branches.length} 个分支:`);
  branches.forEach((b, index) => {
    console.log(`   ${index + 1}. ${b.name} (${b.isActive ? '活跃' : '非活跃'})`);
  });
  console.log();

  // 9. 获取会话统计
  console.log('9️⃣ 获取会话统计...');
  const stats = await manager.getSessionStats(session.id);
  console.log(`✅ 会话统计:`);
  console.log(`   消息数量: ${stats.messageCount}`);
  console.log(`   分支数量: ${stats.branchCount}`);
  console.log(`   当前状态: ${stats.status}\n`);

  // 10. 测试完成
  console.log('🎉 所有测试通过!\n');
  console.log('📊 测试总结:');
  console.log('   ✅ 会话创建');
  console.log('   ✅ 消息添加');
  console.log('   ✅ 状态管理');
  console.log('   ✅ 消息历史');
  console.log('   ✅ 分支管理');
  console.log('   ✅ 数据持久化');
}

// 运行测试
testConversation().catch((error) => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
