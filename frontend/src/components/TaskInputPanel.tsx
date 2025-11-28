import React, { useState } from 'react';
import { Input, Button, Card, Space, message, Radio } from 'antd';
import { SendOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';

const { TextArea } = Input;

type TaskType = 'code_change' | 'query';

interface TaskInputPanelProps {
  onSubmit: (prompt: string, type: TaskType) => void;
  isLoading: boolean;
}

/**
 * 任务输入面板组件
 * 提供输入框让用户输入自然语言提示词，并选择任务模式
 */
const TaskInputPanel: React.FC<TaskInputPanelProps> = ({ onSubmit, isLoading }) => {
  const [prompt, setPrompt] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('code_change');

  const handleSubmit = () => {
    const trimmedPrompt = prompt.trim();
    
    if (!trimmedPrompt) {
      message.warning('请输入任务描述');
      return;
    }

    if (trimmedPrompt.length > 5000) {
      message.error('任务描述不能超过 5000 字符');
      return;
    }

    onSubmit(trimmedPrompt, taskType);
    setPrompt(''); // 清空输入框
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter 提交
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <Card 
      title="创建新任务" 
      style={{ marginBottom: 24 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <div style={{ marginBottom: 8, fontWeight: 500 }}>任务模式</div>
          <Radio.Group 
            value={taskType} 
            onChange={(e) => setTaskType(e.target.value)}
            disabled={isLoading}
          >
            <Radio.Button value="code_change">
              <EditOutlined /> 编辑模式
            </Radio.Button>
            <Radio.Button value="query">
              <EyeOutlined /> 只读模式
            </Radio.Button>
          </Radio.Group>
          <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
            {taskType === 'code_change' 
              ? '允许 AI 修改代码并创建 Merge Request' 
              : '仅查询信息，不修改代码'}
          </div>
        </div>
        
        <TextArea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="请用自然语言描述你想要完成的任务，例如：&#10;- 修改登录按钮颜色为蓝色&#10;- 添加用户列表分页功能&#10;- 修复表单验证错误&#10;&#10;提示：按 Ctrl/Cmd + Enter 快速提交"
          rows={6}
          disabled={isLoading}
          maxLength={5000}
          showCount
        />
        <Button
          type="primary"
          size="large"
          icon={<SendOutlined />}
          onClick={handleSubmit}
          loading={isLoading}
          disabled={!prompt.trim()}
          block
        >
          {isLoading ? '任务执行中...' : '提交任务'}
        </Button>
      </Space>
    </Card>
  );
};

export default TaskInputPanel;
