import React, { useEffect, useState, useRef, KeyboardEvent } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';
import type { SlashCommandMeta } from '../types/conversation';
import { buildSlashCommandText, filterSlashCommands, getSlashQuery } from '../utils/slashCommands';

const { TextArea } = Input;

interface MessageInputProps {
  sessionId?: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
  placeholder?: string;
  actions?: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  slashCommands?: SlashCommandMeta[];
  onSlashCommand?: (
    command: SlashCommandMeta,
    context: { currentValue: string; setValue: (nextValue: string) => void }
  ) => boolean | void;
}

/**
 * 消息输入组件
 * 支持多行文本输入、Markdown、快捷键发送
 */
const MobileMessageInput: React.FC<MessageInputProps> = ({
  disabled = false,
  onSend,
  placeholder = '输入消息... (Ctrl+Enter 发送)',
  actions,
  value,
  onChange,
  slashCommands = [],
  onSlashCommand,
}) => {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const textAreaRef = useRef<any>(null);

  /**
   * 处理发送消息
   */
  const currentValue = onChange ? value ?? '' : content;
  const { active: slashActive, query: slashQuery } = getSlashQuery(currentValue);
  const filteredSlashCommands = slashActive ? filterSlashCommands(slashCommands, slashQuery) : [];
  const slashOpen = slashActive && filteredSlashCommands.length > 0;
  const applyInputValue = (nextValue: string) => {
    if (onChange) onChange(nextValue);
    else setContent(nextValue);
  };
  const pickSlashCommand = (command: SlashCommandMeta) => {
    const handled = onSlashCommand?.(command, {
      currentValue,
      setValue: applyInputValue,
    });
    if (handled) return;
    applyInputValue(buildSlashCommandText(command));
  };
  useEffect(() => {
    if (!slashOpen) {
      setSlashSelectedIndex(0);
    } else if (slashSelectedIndex >= filteredSlashCommands.length) {
      setSlashSelectedIndex(0);
    }
  }, [slashOpen, slashSelectedIndex, filteredSlashCommands.length]);
  const handleSend = async () => {
    // 验证输入
    const trimmedContent = currentValue.trim();
    if (!trimmedContent) {
      return;
    }

    if (disabled || sending) {
      return;
    }

    setSending(true);
    try {
      await onSend(currentValue);
      // 发送成功后清空输入框
      if (onChange) {
        onChange('');
      } else {
        setContent('');
      }
      // 重新聚焦到输入框
      textAreaRef.current?.focus();
    } catch (error) {
      console.error('发送消息失败:', error);
    } finally {
      setSending(false);
    }
  };

  /**
   * 处理键盘事件
   * Ctrl+Enter 或 Cmd+Enter 发送消息
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev - 1 + filteredSlashCommands.length) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickSlashCommand(filteredSlashCommands[slashSelectedIndex] || filteredSlashCommands[0]);
        setSlashSelectedIndex(0);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashSelectedIndex(0);
        return;
      }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * 处理输入变化
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    if (onChange) {
      onChange(nextValue);
    } else {
      setContent(nextValue);
    }
  };

  const isDisabled = disabled || sending;
  const canSend = currentValue.trim().length > 0 && !isDisabled;

  return (
    <div className="chat-input">
      <div className="chat-input-textarea">
        <TextArea
          ref={textAreaRef}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={sending ? 'AI 正在处理中...' : placeholder}
          disabled={isDisabled}
          bordered={false}
          autoSize={{ minRows: 1, maxRows: 8 }}
        />
        {slashOpen && (
          <div className="slash-command-panel">
            {filteredSlashCommands.map((command, index) => (
              <button
                key={command.name}
                type="button"
                className={`slash-command-item${index === slashSelectedIndex ? ' slash-command-item-active' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pickSlashCommand(command);
                  setSlashSelectedIndex(0);
                }}
              >
                <div className="slash-command-name">/{command.name}</div>
                <div className="slash-command-desc">{command.description}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {actions ? <div className="chat-input-actions">{actions}</div> : null}
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleSend}
        disabled={!canSend}
        loading={sending}
        className="chat-send-button"
        title={sending ? 'AI 正在处理中...' : canSend ? '发送消息 (Ctrl+Enter)' : '请输入消息'}
      />
    </div>
  );
};

export default MobileMessageInput;
