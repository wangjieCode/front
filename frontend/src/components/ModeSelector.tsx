import React from 'react';
import { Segmented, Tooltip } from 'antd';
import { EditOutlined, EyeOutlined } from '@ant-design/icons';
import { ConversationMode } from '../types/conversation';

interface ModeSelectorProps {
  value: ConversationMode;
  onChange: (mode: ConversationMode) => void;
  disabled?: boolean;
}

/**
 * 对话模式选择器组件
 */
const ModeSelector: React.FC<ModeSelectorProps> = ({ value, onChange, disabled = false }) => {
  const options = [
    {
      label: (
        <Tooltip title="AI 只能查询代码，不能修改">
          <span>
            <EyeOutlined style={{ marginRight: 6 }} />
            只读模式
          </span>
        </Tooltip>
      ),
      value: ConversationMode.READONLY,
    },
    {
      label: (
        <Tooltip title="AI 可以修改代码，创建 Git 分支，用户手动创建 MR">
          <span>
            <EditOutlined style={{ marginRight: 6 }} />
            编辑模式
          </span>
        </Tooltip>
      ),
      value: ConversationMode.EDIT,
    },
  ];

  return (
    <Segmented
      options={options}
      value={value}
      onChange={(val) => onChange(val as ConversationMode)}
      disabled={disabled}
      style={{ marginBottom: 16 }}
    />
  );
};

export default ModeSelector;
