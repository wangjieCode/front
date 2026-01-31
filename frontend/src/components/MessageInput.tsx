import React, { useState, useRef, KeyboardEvent } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface MessageInputProps {
  sessionId?: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
  placeholder?: string;
  actions?: React.ReactNode;
}

/**
 * 消息输入组件
 * 支持多行文本输入、Markdown、快捷键发送
 */
const MessageInput: React.FC<MessageInputProps> = ({
  disabled = false,
  onSend,
  placeholder = '输入消息... (Ctrl+Enter 发送)',
  actions,
}) => {
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const textAreaRef = useRef<any>(null);

  /**
   * 处理发送消息
   */
  const handleSend = async () => {
    // 验证输入
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    if (disabled || sending) {
      return;
    }

    setSending(true);
    try {
      await onSend(content);
      // 发送成功后清空输入框
      setContent('');
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
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * 处理输入变化
   */
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const isDisabled = disabled || sending;
  const canSend = content.trim().length > 0 && !isDisabled;

  return (
    <div className="chat-input">
      <div className="chat-input-textarea">
        <TextArea
          ref={textAreaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={sending ? 'AI 正在处理中...' : placeholder}
          disabled={isDisabled}
          bordered={false}
          autoSize={{ minRows: 1, maxRows: 8 }}
        />
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

export default MessageInput;
