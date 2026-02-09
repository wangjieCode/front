import { DEFAULT_NEOVATE_MODEL, NEOVATE_MODEL_OPTIONS, NeovateModelOption, NeovateModelProvider } from '@front/shared';
import { runNeovateSdk } from '../utils/NeovateSdkRunner';

export interface RuntimeModelOption extends NeovateModelOption {
  enabled: boolean;
}

interface ProviderAvailability {
  iflow: boolean;
  codex: boolean;
}

export class ModelAvailabilityService {
  private providerAvailability: ProviderAvailability = {
    iflow: false,
    codex: false,
  };

  private initialized = false;

  async initialize(workDir: string): Promise<void> {
    const iflowAvailable = !!process.env.IFLOW_API_KEY?.trim();
    const codexAvailable = await this.checkCodexAvailability(workDir);

    this.providerAvailability = {
      iflow: iflowAvailable,
      codex: codexAvailable,
    };
    this.initialized = true;

    console.log(
      `[ModelAvailabilityService] 模型可用性: iflow=${iflowAvailable}, codex=${codexAvailable}`
    );
  }

  getModelOptions(): RuntimeModelOption[] {
    return NEOVATE_MODEL_OPTIONS.map(option => ({
      ...option,
      enabled: this.isProviderEnabled(option.provider ?? 'iflow'),
    }));
  }

  isModelEnabled(model?: string): boolean {
    if (!model) return false;
    const modelOption = NEOVATE_MODEL_OPTIONS.find(option => option.value === model);
    if (!modelOption) return false;
    return this.isProviderEnabled(modelOption.provider ?? 'iflow');
  }

  resolveDefaultModel(): string {
    if (this.isModelEnabled(DEFAULT_NEOVATE_MODEL)) {
      return DEFAULT_NEOVATE_MODEL;
    }
    const firstEnabledModel = this.getModelOptions().find(option => option.enabled);
    return firstEnabledModel?.value || DEFAULT_NEOVATE_MODEL;
  }

  private isProviderEnabled(provider: NeovateModelProvider): boolean {
    if (!this.initialized) {
      return true;
    }
    return this.providerAvailability[provider];
  }

  private async checkCodexAvailability(workDir: string): Promise<boolean> {
    const timeoutMs = Number(process.env.CODEX_AUTH_CHECK_TIMEOUT_MS || 12000);
    const abortController = new AbortController();
    const timeout = setTimeout(() => {
      abortController.abort();
    }, timeoutMs);

    try {
      const result = await runNeovateSdk({
        prompt: 'Respond with "OK" only.',
        workDir,
        model: 'codex/gpt-5.3-codex',
        abortSignal: abortController.signal,
      });

      if (result.error) {
        console.warn(`[ModelAvailabilityService] Codex 探测失败: ${result.error.message}`);
        return false;
      }

      return !!result.output.trim();
    } catch (error) {
      console.warn(
        `[ModelAvailabilityService] Codex 探测异常: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
