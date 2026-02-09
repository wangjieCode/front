export type NeovateModelProvider = 'iflow' | 'codex';

export interface NeovateModelOption {
  value: string;
  label: string;
  provider: NeovateModelProvider;
  recommended?: boolean;
}

export const NEOVATE_MODEL_OPTIONS: NeovateModelOption[] = [
  { value: 'iflow/glm-4.6', label: 'IFLOW / GLM-4.6', provider: 'iflow' },
  { value: 'iflow/deepseek-v3.2', label: 'IFLOW / DeepSeek-V3.2', provider: 'iflow' },
  { value: 'iflow/qwen3-coder-plus', label: 'IFLOW / Qwen3-Coder-Plus', provider: 'iflow' },
  { value: 'iflow/kimi-k2-thinking', label: 'IFLOW / Kimi-K2-Thinking', provider: 'iflow' },
  { value: 'iflow/minimax-m2', label: 'IFLOW / MiniMax-M2', provider: 'iflow' },
  { value: 'iflow/kimi-k2-0905', label: 'IFLOW / Kimi-K2-0905', provider: 'iflow' },
  { value: 'codex/gpt-5-codex', label: 'Codex / GPT-5-Codex', provider: 'codex', recommended: true },
  { value: 'codex/gpt-5', label: 'Codex / GPT-5', provider: 'codex' },
  { value: 'codex/gpt-5-mini', label: 'Codex / GPT-5-Mini', provider: 'codex' },
  { value: 'codex/gpt-4.1', label: 'Codex / GPT-4.1', provider: 'codex' },
  { value: 'codex/gpt-4.1-mini', label: 'Codex / GPT-4.1-Mini', provider: 'codex' },
];

export const NEOVATE_MODELS = NEOVATE_MODEL_OPTIONS.map(option => option.value);

export const DEFAULT_NEOVATE_MODEL = 'codex/gpt-5-codex';

export const isNeovateModelSupported = (model?: string): boolean => {
  if (!model) return false;
  return NEOVATE_MODELS.includes(model.toLowerCase());
};
