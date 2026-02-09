import React, { useEffect, useState } from 'react';
import { Button, Input, Select, Typography, message } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import MobileModeSelector from './MobileModeSelector';
import MobileProjectSelector from './MobileProjectSelector';
import { ConversationMode } from '../types/conversation';
import { Project } from '../types/project';
import { conversationService } from '../services/conversationService';
import { DEFAULT_NEOVATE_MODEL } from '../constants/neovateModels';
import { useModelOptions } from '../hooks/useModelOptions';
import './MobileCreateConversation.css';

const { Text, Title } = Typography;
const { TextArea } = Input;

type MobileCreateConversationProps = {
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  onNewConversation: (
    prompt: string,
    mode: ConversationMode,
    projectId: string,
    baseBranch?: string,
    model?: string
  ) => Promise<void>;
};

const MobileCreateConversation: React.FC<MobileCreateConversationProps> = ({
  mode,
  onModeChange,
  onNewConversation,
}) => {
  const [prompt, setPrompt] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [baseBranch, setBaseBranch] = useState('');
  const [branchOptions, setBranchOptions] = useState<string[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_NEOVATE_MODEL);
  const { modelOptions, defaultModel } = useModelOptions();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const enabledModels = new Set(modelOptions.filter(option => option.enabled !== false).map(option => option.value));
    if (!enabledModels.has(selectedModel)) {
      setSelectedModel(defaultModel);
    }
  }, [modelOptions, selectedModel, defaultModel]);

  const loadBranches = async (projectId: string, fallbackBranch: string, canceled?: { value: boolean }) => {
    if (loadingBranches) return;
    setLoadingBranches(true);
    try {
      const result = await conversationService.getGitBranches(projectId);
      if (canceled?.value) return;
      const branches = result.branches || [];
      const defaultBranch = result.defaultBranch || fallbackBranch || branches[0] || '';
      setBranchOptions(branches);
      setBaseBranch(defaultBranch);
    } catch (error) {
      if (canceled?.value) return;
      message.error('获取基线分支失败');
      setBranchOptions(fallbackBranch ? [fallbackBranch] : []);
      setBaseBranch(fallbackBranch);
    } finally {
      if (!canceled?.value) {
        setLoadingBranches(false);
      }
    }
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setBranchOptions([]);
      setBaseBranch('');
      return;
    }

    const canceled = { value: false };
    void loadBranches(selectedProjectId, selectedProject?.gitBranch || '', canceled);

    return () => {
      canceled.value = true;
    };
  }, [selectedProjectId, selectedProject?.gitBranch]);

  const handleSubmit = async () => {
    if (!prompt.trim()) {
      message.warning('请输入你的需求');
      return;
    }
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    if (!baseBranch) {
      message.warning('请先选择基线分支');
      return;
    }
    setSubmitting(true);
    try {
      await onNewConversation(prompt, mode, selectedProjectId, baseBranch, selectedModel);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mobile-create">
      <Title level={4} className="mobile-create-title">创建新对话</Title>
      <div className="mobile-create-card">
        <div className="mobile-create-field">
          <Text type="secondary">选择项目 <span className="required">*</span></Text>
          <MobileProjectSelector
            value={selectedProjectId}
            onChange={(projectId, project) => {
              setSelectedProjectId(projectId);
              setSelectedProject(project);
              setBaseBranch(project?.gitBranch || '');
            }}
            placeholder="请选择要操作的项目"
          />
        </div>

        <div className="mobile-create-field">
          <Text type="secondary">基线分支 <span className="required">*</span></Text>
          <Select
            value={baseBranch || undefined}
            placeholder={selectedProjectId ? '请选择基线分支' : '请先选择项目'}
            loading={loadingBranches}
            disabled={!selectedProjectId}
            showSearch
            size="middle"
            onChange={(value) => setBaseBranch(value)}
            onDropdownVisibleChange={(open) => {
              if (open && selectedProjectId) {
                void loadBranches(selectedProjectId, selectedProject?.gitBranch || '');
              }
            }}
            options={branchOptions.map(branch => ({ value: branch, label: branch }))}
          />
        </div>

        <div className="mobile-create-field">
          <Text type="secondary">对话模式</Text>
          <MobileModeSelector value={mode} onChange={onModeChange} />
        </div>

        <div className="mobile-create-field">
          <Text type="secondary">模型</Text>
          <Select
            value={selectedModel}
            size="middle"
            onChange={(value) => setSelectedModel(value)}
            options={modelOptions.map(option => ({
              value: option.value,
              disabled: option.enabled === false,
              label: option.recommended ? `${option.label} (recommend)` : option.label,
            }))}
          />
        </div>

        <div className="mobile-create-field">
          <Text type="secondary">需求描述</Text>
          <TextArea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的功能，例如：在首页添加一个搜索框..."
            autoSize={{ minRows: 4, maxRows: 8 }}
          />
        </div>

        <Button
          type="primary"
          block
          icon={<SendOutlined />}
          loading={submitting}
          onClick={handleSubmit}
          className="mobile-create-submit"
        >
          {submitting ? '正在创建...' : '开始对话'}
        </Button>
      </div>
    </div>
  );
};

export default MobileCreateConversation;
