import { useEffect, useState } from 'react';
import { DEFAULT_NEOVATE_MODEL, NEOVATE_MODEL_OPTIONS, NeovateModelOption } from '@front/shared';
import { conversationService } from '../services/conversationService';

interface UseModelOptionsResult {
  modelOptions: NeovateModelOption[];
  defaultModel: string;
}

export const useModelOptions = (): UseModelOptionsResult => {
  const [modelOptions, setModelOptions] = useState<NeovateModelOption[]>(
    NEOVATE_MODEL_OPTIONS.map(option => ({ ...option, enabled: true }))
  );
  const [defaultModel, setDefaultModel] = useState<string>(DEFAULT_NEOVATE_MODEL);

  useEffect(() => {
    let canceled = false;
    const loadModelConfig = async () => {
      const config = await conversationService.getModelConfig();
      if (canceled) return;

      setModelOptions(config.options);

      const enabledOptions = config.options.filter(option => option.enabled !== false);
      const resolvedDefaultModel = enabledOptions.some(option => option.value === config.defaultModel)
        ? config.defaultModel
        : enabledOptions[0]?.value || DEFAULT_NEOVATE_MODEL;
      setDefaultModel(resolvedDefaultModel);
    };

    void loadModelConfig();
    return () => {
      canceled = true;
    };
  }, []);

  return { modelOptions, defaultModel };
};
