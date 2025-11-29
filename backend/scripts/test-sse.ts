/**
 * 测试 SSE 流式响应功能
 */
import express from 'express';
import streamingRoutes from '../src/routes/streaming';
import { streamingManager } from '../src/streaming/StreamingResponseManager';
import { randomUUID } from 'crypto';

const app = express();
const PORT = 3002;

// 启用 CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 提供静态文件
app.use(express.static('public'));

// 使用 streaming 路由
app.use('/api', streamingRoutes);

// 测试端点：模拟 AI 响应
app.post('/api/test/simulate-ai-response', async (req, res) => {
  const messageId = randomUUID();
  const sessionId = 'test-session-' + Date.now();

  console.log(`\n🤖 模拟 AI 响应`);
  console.log(`Session ID: ${sessionId}`);
  console.log(`Message ID: ${messageId}`);

  // 返回 messageId 给客户端
  res.json({ messageId, sessionId });

  // 异步推送内容
  setTimeout(async () => {
    try {
      const response = 'Hello! This is a simulated AI response that will be streamed word by word.';
      const words = response.split(' ');

      console.log(`\n📤 开始推送内容...`);

      for (const word of words) {
        const chunk = word + ' ';
        await streamingManager.appendContent(messageId, chunk);
        console.log(`  推送: "${chunk.trim()}"`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      await streamingManager.completeStream(messageId);
      console.log(`\n✅ 推送完成`);
    } catch (error) {
      console.error('推送错误:', error);
    }
  }, 1000);
});

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`\n🚀 SSE 测试服务器启动`);
  console.log(`   地址: http://localhost:${PORT}`);
  console.log(`\n📝 测试步骤:`);
  console.log(`   1. 打开浏览器控制台`);
  console.log(`   2. 访问: http://localhost:${PORT}/test.html`);
  console.log(`   3. 或使用以下代码测试:\n`);
  console.log(`   // 1. 获取 messageId`);
  console.log(`   fetch('http://localhost:${PORT}/api/test/simulate-ai-response', { method: 'POST' })`);
  console.log(`     .then(r => r.json())`);
  console.log(`     .then(data => {`);
  console.log(`       // 2. 建立 SSE 连接`);
  console.log(`       const es = new EventSource(\`http://localhost:${PORT}/api/conversations/\${data.sessionId}/messages/\${data.messageId}/stream\`);`);
  console.log(`       es.addEventListener('chunk', e => console.log('Chunk:', JSON.parse(e.data).data));`);
  console.log(`       es.addEventListener('complete', () => { console.log('Complete!'); es.close(); });`);
  console.log(`     });\n`);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n\n🛑 关闭服务器...');
  await streamingManager.closeAll();
  server.close(() => {
    console.log('✓ 服务器已关闭');
    process.exit(0);
  });
});
