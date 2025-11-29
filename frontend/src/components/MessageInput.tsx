import React, { useState, useRef, KeyboardEvent } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface MessageInputProps {
  sessionId?: string;
  disabled?: boolean;
  onSend: (content: string) => Promise<void>;
  placeholder?: string;
}

/**
 * 消息输入组件
 * 支持多行文本输入、Markdown、快捷键发送
 */
const MessageInput: React.FC<MessageInputProps> = ({
  disabled = false,
  onSend,
  placeholder = '输入消息... (Ctrl+Enter 发送)',
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
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div style={{ flex: 1 }}>
        <TextArea
          ref={textAreaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isDisabled}
          autoSize={{ minRows: 2, maxRows: 8 }}
          style={{
            resize: 'none',
            fontSize: 15,
            lineHeight: 1.6,
            borderRadius: 8,
            padding: '12px'
          }}
        />
      </div>
      <Button
        type="primary"
        icon={<SendOutlined />}
        onClick={handleSend}
        disabled={!canSend}
        loading={sending}
        shape="circle"
        size="large"
        style={{
          background: canSend ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : undefined,
          border: 'none',
          boxShadow: canSend ? '0 2px 8px rgba(102, 126, 234, 0.3)' : undefined
        }}
      />
    </div>
  );
};

export default MessageInput;
