export type NeovateModelProvider = 'iflow' | 'codex';

export interface NeovateModelOption {
  value: string;
  label: string;
  provider?: NeovateModelProvider;
  recommended?: boolean;
  enabled?: boolean;
}

export const NEOVATE_MODEL_OPTIONS: NeovateModelOption[] = [
  { value: 'iflow/glm-4.6', label: 'IFLOW / GLM-4.6', provider: 'iflow' },
  { value: 'iflow/deepseek-v3.2', label: 'IFLOW / DeepSeek-V3.2', provider: 'iflow' },
  { value: 'iflow/qwen3-coder-plus', label: 'IFLOW / Qwen3-Coder-Plus', provider: 'iflow' },
  { value: 'iflow/kimi-k2-thinking', label: 'IFLOW / Kimi-K2-Thinking', provider: 'iflow' },
  { value: 'iflow/minimax-m2', label: 'IFLOW / MiniMax-M2', provider: 'iflow' },
  { value: 'iflow/kimi-k2-0905', label: 'IFLOW / Kimi-K2-0905', provider: 'iflow' },
  { value: 'codex/gpt-5.1-codex', label: 'Codex / GPT-5.1-Codex', provider: 'codex' },
  { value: 'codex/gpt-5.1-codex-mini', label: 'Codex / GPT-5.1-Codex-mini', provider: 'codex' },
  { value: 'codex/gpt-5.1-codex-max', label: 'Codex / GPT 5.1 Codex Max', provider: 'codex' },
  { value: 'codex/gpt-5.2', label: 'Codex / GPT-5.2', provider: 'codex' },
  { value: 'codex/gpt-5.2-codex', label: 'Codex / GPT-5.2-Codex', provider: 'codex' },
  { value: 'codex/gpt-5.3-codex', label: 'Codex / GPT-5.3 Codex', provider: 'codex', recommended: true },
];

export const NEOVATE_MODELS = NEOVATE_MODEL_OPTIONS.map(option => option.value);

export const DEFAULT_NEOVATE_MODEL = 'iflow/deepseek-v3.2';

export const isNeovateModelSupported = (model?: string): boolean => {
  if (!model) return false;
  return NEOVATE_MODELS.includes(model);
};
