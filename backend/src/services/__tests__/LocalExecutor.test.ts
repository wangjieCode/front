import { buildGitAuthEnv, isGitNetworkCommand } from '../LocalExecutor';

describe('LocalExecutor Git auth injection', () => {
  const originalToken = process.env.GITLAB_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITLAB_TOKEN;
    } else {
      process.env.GITLAB_TOKEN = originalToken;
    }
  });

  test('git fetch 命令会注入 Bearer 头', () => {
    process.env.GITLAB_TOKEN = 'test-token';

    const env = buildGitAuthEnv('git fetch origin main');

    expect(env?.GIT_HTTP_EXTRAHEADER).toBe('Authorization: Bearer test-token');
  });

  test('git remote update 命令会注入 Bearer 头', () => {
    process.env.GITLAB_TOKEN = 'remote-token';

    const env = buildGitAuthEnv('git remote update');

    expect(env?.GIT_HTTP_EXTRAHEADER).toBe('Authorization: Bearer remote-token');
  });

  test('git status 不注入 Bearer 头', () => {
    process.env.GITLAB_TOKEN = 'test-token';

    const env = buildGitAuthEnv('git status');

    expect(env?.GIT_HTTP_EXTRAHEADER).toBeUndefined();
  });

  test('无 GITLAB_TOKEN 时不注入 Bearer 头', () => {
    delete process.env.GITLAB_TOKEN;

    const env = buildGitAuthEnv('git fetch origin main');

    expect(env?.GIT_HTTP_EXTRAHEADER).toBeUndefined();
  });

  test('识别常见网络 git 子命令', () => {
    expect(isGitNetworkCommand('git fetch origin')).toBe(true);
    expect(isGitNetworkCommand('git pull origin main')).toBe(true);
    expect(isGitNetworkCommand('git push origin main')).toBe(true);
    expect(isGitNetworkCommand('git clone https://example.com/a.git')).toBe(true);
    expect(isGitNetworkCommand('git ls-remote https://example.com/a.git')).toBe(true);
    expect(isGitNetworkCommand('git remote update')).toBe(true);
    expect(isGitNetworkCommand('git remote --verbose update')).toBe(true);
    expect(isGitNetworkCommand('git -C /tmp/repo fetch origin')).toBe(true);
    expect(isGitNetworkCommand('git remote set-url origin https://example.com/a.git')).toBe(false);
    expect(isGitNetworkCommand('git diff')).toBe(false);
  });
});
