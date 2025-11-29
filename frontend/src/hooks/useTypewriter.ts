import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 打字机效果配置
 */
export interface TypewriterConfig {
  speed?: number; // 字符显示速度（毫秒/字符）
  minSpeed?: number; // 最小速度
  maxSpeed?: number; // 最大速度
  pauseOnScroll?: boolean; // 滚动时暂停
  autoScroll?: boolean; // 自动滚动到最新消息
  enabled?: boolean; // 是否启用打字机效果
}

/**
 * 打字机效果 Hook
 * 
 * @param content - 完整内容
 * @param config - 配置选项
 * @returns 打字机状态和控制方法
 */
export function useTypewriter(content: string, config?: TypewriterConfig) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);

  const currentIndexRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef(Date.now());
  const scrollContainerRef = useRef<HTMLElement | null>(null);

  const defaultConfig: Required<TypewriterConfig> = {
    speed: config?.speed ?? 30,
    minSpeed: config?.minSpeed ?? 10,
    maxSpeed: config?.maxSpeed ?? 100,
    pauseOnScroll: config?.pauseOnScroll ?? true,
    autoScroll: config?.autoScroll ?? true,
    enabled: config?.enabled ?? true,
  };

  /**
   * 自动滚动到底部
   */
  const scrollToBottom = useCallback(() => {
    if (!defaultConfig.autoScroll) return;

    // 尝试找到滚动容器
    if (!scrollContainerRef.current) {
      scrollContainerRef.current =
        document.querySelector('.message-container') ||
        document.querySelector('.chat-container') ||
        document.documentElement;
    }

    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [defaultConfig.autoScroll]);

  /**
   * 暂停打字机效果
   */
  const pause = useCallback(() => {
    setIsPaused(true);
  }, []);

  /**
   * 恢复打字机效果
   */
  const resume = useCallback(() => {
    setIsPaused(false);
    lastUpdateTimeRef.current = Date.now();
  }, []);

  /**
   * 跳过打字机效果，直接显示全部内容
   */
  const skip = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setDisplayedContent(content);
    currentIndexRef.current = content.length;
    setProgress(100);
    setIsTyping(false);
    setIsPaused(false);
  }, [content]);

  /**
   * 重置打字机效果
   */
  const reset = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setDisplayedContent('');
    currentIndexRef.current = 0;
    setProgress(0);
    setIsTyping(false);
    setIsPaused(false);
    lastUpdateTimeRef.current = Date.now();
  }, []);

  /**
   * 打字机动画循环
   */
  const animate = useCallback(() => {
    if (!defaultConfig.enabled) {
      setDisplayedContent(content);
      setProgress(100);
      setIsTyping(false);
      return;
    }

    if (isPaused) {
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdateTimeRef.current;

    if (elapsed >= defaultConfig.speed && currentIndexRef.current < content.length) {
      const nextIndex = currentIndexRef.current + 1;
      setDisplayedContent(content.slice(0, nextIndex));
      currentIndexRef.current = nextIndex;

      // 更新进度
      const newProgress = (nextIndex / content.length) * 100;
      setProgress(newProgress);

      // 自动滚动
      if (nextIndex % 10 === 0) {
        // 每 10 个字符滚动一次
        scrollToBottom();
      }

      lastUpdateTimeRef.current = now;
    }

    if (currentIndexRef.current < content.length) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [content, isPaused, defaultConfig, scrollToBottom]);

  // 监听滚动事件
  useEffect(() => {
    if (!defaultConfig.pauseOnScroll) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      if (isTyping && !isPaused) {
        pause();

        // 停止滚动后恢复
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          resume();
        }, 1000);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isTyping, isPaused, pause, resume, defaultConfig.pauseOnScroll]);

  // 内容变化时启动打字机效果
  useEffect(() => {
    if (!content) {
      reset();
      return;
    }

    // 如果内容增加了，继续打字
    if (content.length > currentIndexRef.current) {
      if (!isTyping) {
        setIsTyping(true);
      }
      lastUpdateTimeRef.current = Date.now();
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [content, animate, isTyping, reset]);

  return {
    displayedContent,
    isTyping,
    isPaused,
    progress,
    pause,
    resume,
    skip,
    reset,
  };
}
