/**
 * Agent 对话消息类型定义
 * 与后端 NeovateMessageParser 保持一致
 */

// 消息基础类型
export interface BaseMessage {
  id: string;
  timestamp: string;
  sessionId: string;
}

// 系统初始化消息
export interface SystemMessage extends BaseMessage {
  type: 'system';
  subtype: 'init';
  model: string;
  cwd: string;
  tools: string[];
}

// 消息内容（文本或工具调用）
export type MessageContent = TextContent | ToolUseContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, any>;
  description?: string;
}

// AI 助手消息
export interface AssistantMessage extends BaseMessage {
  type: 'assistant';
  role: 'assistant';
  uuid: string;
  parentUuid: string;
  text: string;
  content: MessageContent[];
  model: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// 工具执行结果内容
export interface ToolResultContent {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;
  result: {
    returnDisplay: string;
    llmContent?: string;
  };
}

// 工具执行结果消息
export interface ToolMessage extends BaseMessage {
  type: 'tool';
  role: 'tool';
  uuid: string;
  parentUuid: string;
  content: ToolResultContent[];
}

// 最终结果消息
export interface ResultMessage extends BaseMessage {
  type: 'result';
  subtype: 'success' | 'error';
  isError: boolean;
  content: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

// 联合类型
export type ConversationMessage = 
  | SystemMessage 
  | AssistantMessage 
  | ToolMessage 
  | ResultMessage;

// WebSocket 消息包装
export interface ConversationMessageWrapper {
  type: 'conversation';
  message: ConversationMessage;
}

// 类型守卫函数
export function isSystemMessage(message: ConversationMessage): message is SystemMessage {
  return message.type === 'system';
}

export function isAssistantMessage(message: ConversationMessage): message is AssistantMessage {
  return message.type === 'assistant';
}

export function isToolMessage(message: ConversationMessage): message is ToolMessage {
  return message.type === 'tool';
}

export function isResultMessage(message: ConversationMessage): message is ResultMessage {
  return message.type === 'result';
}

export function isToolUseContent(content: MessageContent): content is ToolUseContent {
  return content.type === 'tool_use';
}

export function isTextContent(content: MessageContent): content is TextContent {
  return content.type === 'text';
}
