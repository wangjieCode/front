export interface NeovateModelOption {
  value: string;
  label: string;
  recommended?: boolean;
  enabled?: boolean;
}

export const NEOVATE_MODEL_OPTIONS: NeovateModelOption[] = [
  { value: 'iflow/glm-4.6', label: 'IFLOW / GLM-4.6' },
  { value: 'iflow/deepseek-v3.2', label: 'IFLOW / DeepSeek-V3.2' },
  { value: 'iflow/qwen3-coder-plus', label: 'IFLOW / Qwen3-Coder-Plus' },
  { value: 'iflow/kimi-k2-thinking', label: 'IFLOW / Kimi-K2-Thinking' },
  { value: 'iflow/minimax-m2', label: 'IFLOW / MiniMax-M2' },
  { value: 'iflow/kimi-k2-0905', label: 'IFLOW / Kimi-K2-0905' },
  { value: 'codex/gpt-5-codex', label: 'Codex / GPT-5-Codex', recommended: true },
  { value: 'codex/gpt-5', label: 'Codex / GPT-5' },
  { value: 'codex/gpt-5-mini', label: 'Codex / GPT-5-Mini' },
  { value: 'codex/gpt-4.1', label: 'Codex / GPT-4.1' },
  { value: 'codex/gpt-4.1-mini', label: 'Codex / GPT-4.1-Mini' },
];

export const DEFAULT_NEOVATE_MODEL = 'codex/gpt-5-codex';

export const isNeovateModelSupported = (value?: string): boolean => {
  if (!value) return false;
  return NEOVATE_MODEL_OPTIONS.some(option => option.value === value);
};
