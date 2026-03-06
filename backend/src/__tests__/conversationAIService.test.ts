import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConversationAIService } from '../services/ConversationAIService';
import { DEFAULT_NEOVATE_MODEL } from '@front/shared';

jest.mock('../services/NeovateSessionManagerDB', () => ({
  NeovateSessionManagerDB: jest.fn().mockImplementation(() => ({
    getSessionId: jest.fn().mockResolvedValue(null),
  })),
}));

describe('ConversationAIService.generateResponseStream', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.MIDSCENE_MODEL_BASE_URL;
    delete process.env.MIDSCENE_MODEL_API_KEY;
    delete process.env.MIDSCENE_MODEL_NAME;
    process.env.NEOVATE_SKILLS_ROOT = path.join(os.tmpdir(), 'missing-neovate-skills-root');
    process.env.NEOVATE_DEFAULT_SKILLS = 'zadig-workflow-deploy';
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('calls AI service with the conversation workDir for streaming', async () => {
    const modifyCodeStream = jest.fn().mockResolvedValue({
      success: true,
      changes: [],
      message: 'ok',
      rawOutput: 'ok',
    });

    const neovateService = {
      modifyCodeStream,
    } as any;

    const gitService = {
      addAll: jest.fn(),
      commit: jest.fn(),
      push: jest.fn(),
    } as any;

    const service = new ConversationAIService(
      neovateService,
      'postgres://user:pass@localhost:5432/db',
      gitService
    );

    const context = {
      projectInfo: {
        workDir: '/worktrees/user-1/conversation-session-1',
      },
    } as any;

    const onChunk = jest.fn();

    await service.generateResponseStream(context, 'hello', 'session-1', onChunk);

    expect(modifyCodeStream).toHaveBeenCalledTimes(1);
    const [prompt, sessionId, neovateSessionId, workDir, passedOnChunk, model, signal, skills] = modifyCodeStream.mock.calls[0];
    expect(prompt).toBe('hello');
    expect(sessionId).toBe('session-1');
    expect(neovateSessionId).toBeUndefined();
    expect(workDir).toBe('/worktrees/user-1/conversation-session-1');
    expect(passedOnChunk).toBe(onChunk);
    expect(model).toBe(DEFAULT_NEOVATE_MODEL);
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(skills).toEqual([]);
  });

  it('会从全局 ~/.neovate/skills（可配置）解析并透传到 AI 服务', async () => {
    const modifyCodeStream = jest.fn().mockResolvedValue({
      success: true,
      changes: [],
      message: 'ok',
      rawOutput: 'ok',
    });

    const neovateService = {
      modifyCodeStream,
    } as any;

    const gitService = {
      addAll: jest.fn(),
      commit: jest.fn(),
      push: jest.fn(),
    } as any;

    const service = new ConversationAIService(
      neovateService,
      'postgres://user:pass@localhost:5432/db',
      gitService
    );

    const skillsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-pass-'));
    process.env.NEOVATE_SKILLS_ROOT = skillsRoot;
    process.env.NEOVATE_DEFAULT_SKILLS = 'zadig-workflow-deploy,another-skill';
    fs.mkdirSync(path.join(skillsRoot, 'zadig-workflow-deploy'), { recursive: true });
    fs.mkdirSync(path.join(skillsRoot, 'another-skill'), { recursive: true });

    const context = { projectInfo: { workDir: '/worktrees/user-1/conversation-session-2' } } as any;
    const onChunk = jest.fn();

    await service.generateResponseStream(context, 'hello', 'session-2', onChunk);

    expect(modifyCodeStream).toHaveBeenCalledTimes(1);
    const passedSkills = modifyCodeStream.mock.calls[0][7] as string[];
    expect(passedSkills).toEqual([
      path.join(skillsRoot, 'zadig-workflow-deploy'),
      path.join(skillsRoot, 'another-skill'),
    ]);
  });

  it('包含图片时会先调用视觉模型并将提炼信息汇总后发送给主AI', async () => {
    process.env.MIDSCENE_MODEL_BASE_URL = 'https://vision.example/v1';
    process.env.MIDSCENE_MODEL_API_KEY = 'vision-test-key';
    process.env.MIDSCENE_MODEL_NAME = 'gpt-4o-mini';

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: '图片显示登录表单，包含用户名、密码输入框和登录按钮。',
            },
          },
        ],
      }),
    });
    global.fetch = fetchMock as any;

    const modifyCodeStream = jest.fn().mockResolvedValue({
      success: true,
      changes: [],
      message: 'ok',
      rawOutput: 'ok',
    });

    const neovateService = {
      modifyCodeStream,
    } as any;

    const gitService = {
      addAll: jest.fn(),
      commit: jest.fn(),
      push: jest.fn(),
    } as any;

    const service = new ConversationAIService(
      neovateService,
      'postgres://user:pass@localhost:5432/db',
      gitService
    );

    const context = {
      projectInfo: {
        workDir: '/worktrees/user-1/conversation-session-1',
      },
    } as any;

    const onChunk = jest.fn();
    const images = [
      {
        data: 'iVBORw0KGgoAAAANSUhEUgAAAAUA',
        mimeType: 'image/png',
      },
    ] as any;

    await service.generateResponseStream(
      context,
      '请根据图片完善登录页校验逻辑',
      'session-vision',
      onChunk,
      undefined,
      images
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe('https://vision.example/v1/chat/completions');
    const requestBody = JSON.parse((requestInit as RequestInit).body as string);
    expect(requestBody.model).toBe('gpt-4o-mini');
    expect(requestBody.messages[0].role).toBe('system');
    expect(requestBody.messages).toHaveLength(2);
    expect(requestBody.messages[1]).toEqual({
      role: 'user',
      content: [expect.objectContaining({ type: 'image_url' })],
    });

    expect(modifyCodeStream).toHaveBeenCalledTimes(1);
    const mergedPrompt = modifyCodeStream.mock.calls[0][0] as string;
    expect(mergedPrompt).toContain('【用户原始需求】');
    expect(mergedPrompt).toContain('请根据图片完善登录页校验逻辑');
    expect(mergedPrompt).toContain('【图片关键信息（由视觉模型提炼）】');
    expect(mergedPrompt).toContain('用户名、密码输入框和登录按钮');
  });
});
