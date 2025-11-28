/**
 * 流式输出测试脚本
 */

import { LocalExecutor } from '../src/services/LocalExecutor';

async function testStreamOutput() {
  console.log('=== 测试 LocalExecutor 流式输出 ===\n');

  const executor = new LocalExecutor();
  
  console.log('执行命令: echo "Line 1" && sleep 1 && echo "Line 2" && sleep 1 && echo "Line 3"');
  console.log('开始执行...\n');
  
  const result = await executor.executeCommandStream(
    'echo "Line 1" && sleep 1 && echo "Line 2" && sleep 1 && echo "Line 3"',
    undefined,
    (data: string) => {
      console.log('[实时输出]', data.trim());
    },
    (error: string) => {
      console.error('[错误输出]', error.trim());
    }
  );
  
  console.log('\n执行完成！');
  console.log('退出码:', result.exitCode);
  console.log('完整输出:', result.stdout);
  
  if (result.exitCode === 0) {
    console.log('\n✅ 流式输出测试通过！');
  } else {
    console.log('\n❌ 流式输出测试失败！');
  }
}

testStreamOutput().catch(error => {
  console.error('测试失败:', error);
  process.exit(1);
});
