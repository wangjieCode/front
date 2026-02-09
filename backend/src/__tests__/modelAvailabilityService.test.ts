import { ModelAvailabilityService } from '../services/ModelAvailabilityService';

jest.mock('../utils/NeovateSdkRunner', () => ({
  runNeovateSdk: jest.fn(),
}));

const { runNeovateSdk } = require('../utils/NeovateSdkRunner');

describe('ModelAvailabilityService Codex 可用性探测', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.IFLOW_API_KEY = 'iflow-test-key';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('Codex 探测成功时应启用 codex 模型', async () => {
    runNeovateSdk.mockResolvedValue({
      output: '{"ok":true}\n',
      durationMs: 30,
      sessionId: 'session-1',
      error: undefined,
    });

    const service = new ModelAvailabilityService();
    await service.initialize('/tmp');

    const options = service.getModelOptions();
    const codexOptions = options.filter((option: any) => option.value.startsWith('codex/'));

    expect(codexOptions.length).toBeGreaterThan(0);
    expect(codexOptions.every((option: any) => option.enabled)).toBe(true);
    expect(service.isModelEnabled('codex/gpt-5.3-codex')).toBe(true);
  });

  it('Codex 探测失败时应禁用 codex 模型并回退默认模型', async () => {
    runNeovateSdk.mockResolvedValue({
      output: '',
      durationMs: 20,
      sessionId: undefined,
      error: new Error('codex auth failed'),
    });
    const service = new ModelAvailabilityService();
    await service.initialize('/tmp');

    const options = service.getModelOptions();
    const codexOptions = options.filter((option: any) => option.value.startsWith('codex/'));
    const iflowOptions = options.filter((option: any) => option.value.startsWith('iflow/'));

    expect(codexOptions.length).toBeGreaterThan(0);
    expect(codexOptions.every((option: any) => !option.enabled)).toBe(true);
    expect(iflowOptions.length).toBeGreaterThan(0);
    expect(iflowOptions.every((option: any) => option.enabled)).toBe(true);
    expect(service.isModelEnabled('codex/gpt-5.3-codex')).toBe(false);
    expect(service.resolveDefaultModel()).toBe('iflow/qwen3-coder-plus');
  });
});
