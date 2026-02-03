export const NEOVATE_MODELS = [
  'iflow/glm-4.6',
  'iflow/deepseek-v3.2',
  'iflow/qwen3-coder-plus',
  'iflow/kimi-k2-thinking',
  'iflow/minimax-m2',
  'iflow/kimi-k2-0905',
];

export const DEFAULT_NEOVATE_MODEL = 'iflow/qwen3-coder-plus';

export const isNeovateModelSupported = (model?: string): boolean => {
  if (!model) return false;
  return NEOVATE_MODELS.includes(model.toLowerCase());
};
