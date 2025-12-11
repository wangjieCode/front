/**
 * 测试 Neovate 会话上下文保留
 */

async function testSessionContext() {
  const baseUrl = 'http://localhost:3001/api/conversations';

  console.log('========== 测试 Neovate 会话上下文保留 ==========\n');

  // 1. 创建新对话
  console.log('1. 创建新对话...');
  const createResponse = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId: 'test-session-' + Date.now(),
      initialPrompt: '你好，我想了解这个项目',
      projectInfo: {
        workDir: process.env.GIT_WORK_DIR || './workspace',
        gitBranch: process.env.GIT_DEFAULT_BRANCH || 'main',
      },
    }),
  });

  const createData = await createResponse.json();
  if (!createData.success) {
    console.error('❌ 创建对话失败:', createData.error);
    return;
  }

  const sessionId = createData.data.id;
  console.log(`✅ 对话已创建: ${sessionId}\n`);

  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 2. 发送第一条消息
  console.log('2. 发送第一条消息...');
  const msg1Response = await fetch(`${baseUrl}/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '请告诉我 package.json 中的项目名称',
    }),
  });

  const msg1Data = await msg1Response.json();
  if (!msg1Data.success) {
    console.error('❌ 发送消息失败:', msg1Data.error);
    return;
  }

  console.log('✅ 第一条消息已发送');
  console.log('AI 响应:', msg1Data.data[msg1Data.data.length - 1]?.content?.substring(0, 200) + '...\n');

  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 2000));

  // 3. 发送第二条消息（测试上下文保留）
  console.log('3. 发送第二条消息（测试上下文保留）...');
  const msg2Response = await fetch(`${baseUrl}/${sessionId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '那版本号是多少？',  // 这个问题依赖于上一轮的上下文
    }),
  });

  const msg2Data = await msg2Response.json();
  if (!msg2Data.success) {
    console.error('❌ 发送消息失败:', msg2Data.error);
    return;
  }

  console.log('✅ 第二条消息已发送');
  console.log('AI 响应:', msg2Data.data[msg2Data.data.length - 1]?.content?.substring(0, 200) + '...\n');

  // 4. 检查会话映射
  console.log('4. 检查会话映射文件...');
  const fs = require('fs');
  const path = require('path');
  const sessionDir = path.join(__dirname, '../../data/neovate-sessions', sessionId);
  
  try {
    const sessionFile = path.join(sessionDir, 'session.json');
    if (fs.existsSync(sessionFile)) {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
      console.log('✅ 找到会话映射:');
      console.log('  - Conversation ID:', sessionData.taskId);
      console.log('  - Neovate Session ID:', sessionData.neovateSessionId);
      console.log('  - 工作目录:', sessionData.workDir);
      console.log('  - 创建时间:', sessionData.createdAt);
      console.log('  - 最后使用:', sessionData.lastUsedAt);
    } else {
      console.log('⚠️ 未找到会话映射文件');
    }
  } catch (error) {
    console.error('❌ 读取会话映射失败:', error);
  }

  console.log('\n========== 测试完成 ==========');
}

// 运行测试
testSessionContext().catch(console.error);
