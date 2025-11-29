const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function test() {
  const command = 'neovate -q --cwd "/Users/gangqiang/Desktop/front-intern/backend/workspace/dtmall-admin" --output-format json --approval-mode yolo "prod/prodList 的功能是啥"';
  
  console.log('执行命令...');
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      maxBuffer: 100 * 1024 * 1024,
      env: {
        ...process.env,
        IFLOW_API_KEY: process.env.IFLOW_API_KEY,
      }
    });
    
    console.log('stdout 长度:', stdout.length);
    console.log('stderr 长度:', stderr.length);
    console.log('最后100字符:', stdout.slice(-100));
    
    // 验证 JSON
    try {
      const parsed = JSON.parse(stdout);
      console.log('✅ JSON 有效，包含', parsed.length, '个事件');
    } catch (e) {
      console.error('❌ JSON 无效:', e.message);
    }
  } catch (error) {
    console.error('执行失败:', error.message);
  }
}

test();
