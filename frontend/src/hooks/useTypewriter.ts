import { useState, useEffect, useRef } from 'react';

interface UseTypewriterOptions {
  text: string;
  speed?: number; // 每个字符的延迟时间（毫秒）
  enabled?: boolean; // 是否启用打字机效果
}

interface UseTypewriterResult {
  displayText: string;
  isTyping: boolean;
}

/**
 * 打字机效果 Hook
 * 将文本逐字显示，模拟打字机效果
 * 使用队列机制处理文本更新
 */
export function useTypewriter({
  text,
  speed = 15,
  enabled = true,
}: UseTypewriterOptions): UseTypewriterResult {
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const queueRef = useRef<string[]>([]); // 字符队列
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessingRef = useRef(false); // 是否正在处理队列

  // 处理队列中的字符
  const processQueue = () => {
    if (queueRef.current.length === 0) {
      setIsTyping(false);
      isProcessingRef.current = false;
      return;
    }

    setIsTyping(true);
    isProcessingRef.current = true;

    // 从队列中取出一个字符
    const char = queueRef.current.shift()!;
    setDisplayText(prev => prev + char);

    // 继续处理下一个字符
    timeoutRef.current = setTimeout(processQueue, speed);
  };

  useEffect(() => {
    // 如果禁用打字机效果，直接显示完整文本
    if (!enabled) {
      setDisplayText(text);
      setIsTyping(false);
      queueRef.current = [];
      return;
    }

    // 如果文本为空，重置状态
    if (!text) {
      setDisplayText('');
      setIsTyping(false);
      queueRef.current = [];
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      return;
    }

    // 如果新文本比当前显示的文本短，说明是新消息，重置
    if (text.length < displayText.length) {
      setDisplayText('');
      queueRef.current = text.split('');
      if (!isProcessingRef.current) {
        processQueue();
      }
      return;
    }

    // 如果新文本是当前显示文本的前缀，说明文本被截断了，重置
    if (!text.startsWith(displayText)) {
      setDisplayText('');
      queueRef.current = text.split('');
      if (!isProcessingRef.current) {
        processQueue();
      }
      return;
    }

    // 计算新增的字符
    const newChars = text.slice(displayText.length);
    if (newChars.length > 0) {
      // 将新字符加入队列
      queueRef.current.push(...newChars.split(''));
      
      // 如果当前没有在处理队列，开始处理
      if (!isProcessingRef.current) {
        processQueue();
      }
    }
  }, [text, enabled]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    displayText,
    isTyping,
  };
}
