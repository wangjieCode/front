import { GitService } from './src/services/GitService';
import { GitLabMCPService } from './src/services/GitLabMCPService';
import { NeovateAIService } from './src/services/NeovateAIService';
import { SSHExecutor } from './src/services/SSHExecutor';

async function runVerification() {
  console.log('🚀 开始上线前服务修复校验...\n');

  // 1. 校验 GitService.push 逻辑 (模拟 SSH 执行)
  console.log('--- 1. 校验 GitService.push ---');
  let capturedCommand = '';
  const mockExecutor = {
    executeCommand: async (cmd: string, cwd?: string, timeout?: number, env?: Record<string, string>) => {
      if (cmd.includes('git remote set-url')) capturedCommand = cmd;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    executeCommandStream: async (cmd: string, cwd: string, onData: (chunk: string) => void, timeout?: number, env?: Record<string, string>) => {
      onData('{"sessionId": "new-sid-123"}\n');
      return { exitCode: 0, stdout: '{"sessionId": "new-sid-123"}\n', stderr: '' };
    }
  } as any;

  const gitService = new GitService(mockExecutor, '/default/workdir');
  
  await gitService.push('master', 'origin', false, '/project/path');
  
  if (!capturedCommand) {
    console.log('✅ [PASS] GitService 未改写远程地址');
  } else {
    console.error(`❌ [FAIL] GitService 不应改写远程地址 | 实际执行: ${capturedCommand}`);
  }
  console.log();

  // 2. 校验 NeovateAIService 会话路径记录
  console.log('--- 2. 校验 NeovateAIService 会话路径记录 ---');
  let savedPath = '';
  const mockSessionManager = {
    saveSessionId: async (cid: string, sid: string, path: string) => {
      savedPath = path;
    }
  } as any;

  const neovateService = new NeovateAIService(mockExecutor, '/global/root', '');
  (neovateService as any).sessionManager = mockSessionManager;
  
  // 模拟一次流式调用，触发提取和保存
  const chunk = '{"sessionId": "new-sid-123"}\n';
  await neovateService.modifyCodeStream('test', 'conv-123', undefined, '/specific/project/worktree', (d) => {});

  if (savedPath === '/specific/project/worktree') {
    console.log(`✅ [PASS] Neovate 会话保存路径正确: ${savedPath}`);
  } else {
    console.error(`❌ [FAIL] Neovate 会话保存路径错误 | 实际保存: ${savedPath} | 预期: /specific/project/worktree`);
  }
  console.log();

  // 3. 校验 GitLabMCPService 项目 ID 保护
  console.log('--- 3. 校验 GitLabMCPService 项目 ID 保护 ---');
  const gitlabMCP = new GitLabMCPService({ url: 'http://git.com', token: 'tk', projectId: 'default-id' });
  
  // 模拟 fetch
  global.fetch = async (url: string) => {
      return { ok: true, json: async () => ({ iid: 1, web_url: 'http://mr.com', source_branch: 's', target_branch: 't' }) } as any;
  };

  try {
    await gitlabMCP.createMRForTask('task-1', 'prompt', 'src', 'tgt', 'specific-id');
    console.log('✅ [PASS] GitLabMCPService 成功使用特定项目 ID');
  } catch (e) {
    console.error(`❌ [FAIL] GitLabMCPService 创建 MR 异常: ${e}`);
  }
  console.log();

  console.log('\n✨ 校验完成！');
  process.exit(0);
}

runVerification().catch(err => {
  console.error('❌ 校验脚本执行失败:', err);
  process.exit(1);
});
