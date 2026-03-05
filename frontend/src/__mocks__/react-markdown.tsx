import React from 'react';

interface ReactMarkdownProps {
  children?: React.ReactNode;
}

const ReactMarkdown: React.FC<ReactMarkdownProps> = ({ children }) => (
  <>{children}</>
);

export default ReactMarkdown;
