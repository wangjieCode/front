import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface TypewriterTextProps {
  text: string;
  isStreaming: boolean;
  isUser: boolean;
}

/**
 * 带流式效果的文本组件
 * 显示文本内容，并在流式传输时显示闪烁光标
 */
export const TypewriterText: React.FC<TypewriterTextProps> = ({
  text,
  isStreaming,
  isUser,
}) => {
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
        {text}
      </ReactMarkdown>
      
      {/* 流式传输光标 */}
      {!isUser && isStreaming && (
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
