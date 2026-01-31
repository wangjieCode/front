export interface NeovateModelOption {
  value: string;
  label: string;
  recommended?: boolean;
}

export const NEOVATE_MODEL_OPTIONS: NeovateModelOption[] = [
  { value: 'iflow/glm-4.6', label: 'GLM-4.6', recommended: true },
  { value: 'iflow/deepseek-v3.2', label: 'DeepSeek-V3.2' },
  { value: 'iflow/qwen3-coder-plus', label: 'Qwen3-Coder-Plus' },
  { value: 'iflow/kimi-k2-thinking', label: 'Kimi-K2-Thinking' },
  { value: 'iflow/minimax-m2', label: 'MiniMax-M2' },
  { value: 'iflow/kimi-k2-0905', label: 'Kimi-K2-0905' },
];

export const DEFAULT_NEOVATE_MODEL = 'iflow/qwen3-coder-plus';

export const isNeovateModelSupported = (value?: string): boolean => {
  if (!value) return false;
  return NEOVATE_MODEL_OPTIONS.some(option => option.value === value);
};
