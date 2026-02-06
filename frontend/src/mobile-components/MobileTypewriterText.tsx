import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface TypewriterTextProps {
  text: string;
  isStreaming: boolean;
  isUser: boolean;
}

/**
 * 带流式打字机效果的文本组件
 * 显示文本内容，并在流式传输时以打字机速度展示内容
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  isStreaming,
  isUser,
}) => {
  // 记录该组件实例是否属于流式消息（只有初始挂载时就是流式的内容才执行动画效果）
  const shouldAnimate = React.useMemo(() => isStreaming, []);
  // 打字机显示的文本状态
  const [displayedText, setDisplayedText] = useState((isUser || !isStreaming) ? text : '');
  // 目标文本的引用
  const targetTextRef = useRef(text);
  
  // 同步目标文本引用
  useEffect(() => {
    targetTextRef.current = text;
    // 如果不需要动画，或者当前文本已经显示完整，直接同步最新文本
    if (!shouldAnimate || isUser) {
      setDisplayedText(text);
      return;
    }

    // 如果是流式（或者当前没有在补齐过程中），且文本逻辑上不需要打字机追赶了，同步
    if (!isStreaming) {
      if (displayedText.length >= text.length || !text.startsWith(displayedText)) {
        setDisplayedText(text);
      }
    }
  }, [text, isStreaming, isUser, displayedText.length, shouldAnimate]);

  // 处理打字机逻辑
  useEffect(() => {
    if (isUser || !shouldAnimate) {
      setDisplayedText(text);
      return;
    }

    // 定时器逻辑
    const interval = setInterval(() => {
      setDisplayedText(prev => {
        const target = targetTextRef.current;
        
        // 如果目标文本变短了，或者不再以当前显示内容开头，直接重置
        if (!target.startsWith(prev)) {
          return target;
        }

        if (prev.length < target.length) {
          const diff = target.length - prev.length;
          
          // 动态提速：
          // 1. 如果落后较多（如 30 个字符以上），每次跳过更多字符
          // 2. 如果落后巨大（如重新搜索或切换），直接跳过
          let increment = 1;
          if (diff > 500) {
            increment = diff; // 差距太大，直接更新
          } else if (diff > 100) {
            increment = Math.ceil(diff / 5); // 追赶速度适中
          } else if (diff > 20) {
            increment = 2; // 轻微提速
          }
          
          return target.slice(0, prev.length + increment);
        }
        
        return prev;
      });
    }, 20); // 20ms 的轮询率，体感较自然

    return () => clearInterval(interval);
  }, [isUser, shouldAnimate]);

  // 是否正在“打字”
  const isTyping = !isUser && displayedText.length < text.length;

  return (
    <>
      <ReactMarkdown
        components={{
          code({ className, children }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const inline = !match;
            return !inline && match ? (
              <SyntaxHighlighter
                style={vscDarkPlus as any}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: '12px 0',
                  borderRadius: 8,
                  fontSize: 13,
                  border: '1px solid rgba(0,0,0,0.05)',
                }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code
                className={className}
                style={{
                  background: isUser ? 'rgba(255,255,255,0.2)' : '#ebebeb',
                  color: isUser ? '#fff' : '#c7254e',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 13,
                  fontFamily: 'monospace'
                }}
              >
                {children}
              </code>
            );
          },
          p({ children }: any) {
            return <p style={{ margin: '0 0 8px 0', lineHeight: 1.6 }}>{children}</p>;
          },
          ul({ children }: any) {
            return <ul style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ul>;
          },
          ol({ children }: any) {
            return <ol style={{ margin: '8px 0', paddingLeft: 24 }}>{children}</ol>;
          },
          a({ href, children }: any) {
            return <a href={href} style={{ color: isUser ? '#fff' : '#7c5cff', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
        }}
      >
        {displayedText}
      </ReactMarkdown>
      
      {/* 只有在流式传输中或者打字机补齐中时显示光标 */}
      {!isUser && (isStreaming || isTyping) && (
        <span 
          style={{ 
            display: 'inline-block',
            width: '3px',
            height: '18px',
            backgroundColor: '#7c5cff',
            marginLeft: '4px',
            animation: 'blink 0.8s infinite',
            verticalAlign: 'text-bottom',
            borderRadius: '1px',
            boxShadow: '0 0 4px rgba(124, 92, 255, 0.5)'
          }}
        />
      )}
    </>
  );
};
