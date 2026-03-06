import React, { useEffect, useState, useRef, KeyboardEvent } from 'react';
import { Input, Button } from 'antd';
import { SendOutlined, PictureOutlined, CloseOutlined } from '@ant-design/icons';
import type { ImageAttachment } from '../types/conversation';
import type { SlashCommandMeta } from '../types/conversation';
import { buildSlashCommandText, filterSlashCommands, getSlashQuery } from '../utils/slashCommands';

const { TextArea } = Input;

interface MessageInputProps {
  sessionId?: string;
  disabled?: boolean;
  onSend: (content: string, options?: { images?: ImageAttachment[] }) => Promise<void>;
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
const MessageInput: React.FC<MessageInputProps> = ({
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
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const textAreaRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const maxImageSize = 5 * 1024 * 1024;
  const isDisabled = disabled || sending;

  const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const appendAttachmentsFromFiles = async (files: File[]) => {
    if (files.length === 0) return;

    const nextAttachments: ImageAttachment[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        continue;
      }
      if (file.size > maxImageSize) {
        continue;
      }
      const dataUrl = await readFileAsDataUrl(file);
      nextAttachments.push({
        data: dataUrl,
        mimeType: file.type || 'image/png',
        name: file.name,
      });
    }

    if (nextAttachments.length > 0) {
      setAttachments(prev => [...prev, ...nextAttachments]);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    await appendAttachmentsFromFiles(files);
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isDisabled) {
      return;
    }

    const files = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (files.length === 0) return;

    event.preventDefault();
    await appendAttachmentsFromFiles(files);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, idx) => idx !== index));
  };

  /**
   * 处理发送消息
   */
  const currentValue = onChange ? value ?? '' : content;
  const { active: slashActive, query: slashQuery } = getSlashQuery(currentValue);
  const filteredSlashCommands = slashActive ? filterSlashCommands(slashCommands, slashQuery) : [];
  const slashOpen = slashActive && filteredSlashCommands.length > 0;
  useEffect(() => {
    if (!slashOpen) {
      setSlashSelectedIndex(0);
    } else if (slashSelectedIndex >= filteredSlashCommands.length) {
      setSlashSelectedIndex(0);
    }
  }, [slashOpen, slashSelectedIndex, filteredSlashCommands.length]);
  const applyInputValue = (nextValue: string) => {
    if (onChange) {
      onChange(nextValue);
    } else {
      setContent(nextValue);
    }
  };
  const pickSlashCommand = (command: SlashCommandMeta) => {
    const handled = onSlashCommand?.(command, {
      currentValue,
      setValue: applyInputValue,
    });
    if (handled) return;
    applyInputValue(buildSlashCommandText(command));
  };
  const handleSend = async () => {
    // 验证输入
    const trimmedContent = currentValue.trim();
    if (!trimmedContent && attachments.length === 0) {
      return;
    }

    if (disabled || sending) {
      return;
    }

    setSending(true);
    try {
      await onSend(currentValue, { images: attachments });
      // 发送成功后清空输入框
      if (onChange) {
        onChange('');
      } else {
        setContent('');
      }
      setAttachments([]);
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

  const canSend = (currentValue.trim().length > 0 || attachments.length > 0) && !isDisabled;

  return (
    <div className="chat-input">
      <div className="chat-input-main">
        {attachments.length > 0 && (
          <div className="chat-input-attachments">
            {attachments.map((attachment, index) => (
              <div key={`${attachment.name || 'image'}-${index}`} className="chat-input-attachment">
                <img src={attachment.data} alt={attachment.name || '上传图片'} />
                <Button
                  type="text"
                  className="chat-input-attachment-remove"
                  icon={<CloseOutlined />}
                  onClick={() => handleRemoveAttachment(index)}
                />
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-textarea">
          <TextArea
            ref={textAreaRef}
            value={currentValue}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
      </div>
      <div className="chat-input-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileChange}
          disabled={isDisabled}
        />
        <Button
          type="text"
          className="chat-attach-button"
          icon={<PictureOutlined />}
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
        />
        {actions}
      </div>
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
