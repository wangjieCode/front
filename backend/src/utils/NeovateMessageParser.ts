import { newId } from './id';
import dayjs from 'dayjs';

/**
 * neovate 对话消息类型定义
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

/**
 * neovate 消息解析器
 * 解析 neovate 的 stream-json 输出为结构化消息
 */
export class NeovateMessageParser {
  /**
   * 解析 neovate 输出的单行 JSON
   * @param line JSON 字符串
   * @returns 解析后的消息对象，如果解析失败返回 null
   */
  parseStreamLine(line: string): ConversationMessage | null {
    try {
      // 跳过空行
      if (!line.trim()) {
        return null;
      }

      const data = JSON.parse(line);
      
      // 系统初始化消息
      if (data.type === 'system' && data.subtype === 'init') {
        console.log('[NeovateMessageParser] 解析系统消息');
        return {
          id: this.generateId(),
          type: 'system',
          subtype: 'init',
          timestamp: dayjs().toISOString(),
          sessionId: data.sessionId || '',
          model: data.model || '',
          cwd: data.cwd || '',
          tools: data.tools || []
        };
      }
      
      // AI 助手消息
      if (data.role === 'assistant' && data.type === 'message') {
        console.log('[NeovateMessageParser] 解析 assistant 消息');
        return {
          id: this.generateId(),
          type: 'assistant',
          role: 'assistant',
          timestamp: data.timestamp || dayjs().toISOString(),
          sessionId: data.sessionId || '',
          uuid: data.uuid || '',
          parentUuid: data.parentUuid || '',
          text: data.text || '',
          content: data.content || [],
          model: data.model || '',
          usage: data.usage
        };
      }
      
      // 工具结果消息
      if (data.role === 'tool' && data.type === 'message') {
        console.log('[NeovateMessageParser] 解析 tool 消息');
        return {
          id: this.generateId(),
          type: 'tool',
          role: 'tool',
          timestamp: data.timestamp || dayjs().toISOString(),
          sessionId: data.sessionId || '',
          uuid: data.uuid || '',
          parentUuid: data.parentUuid || '',
          content: data.content || []
        };
      }
      
      // 最终结果消息
      if (data.type === 'result') {
        console.log('[NeovateMessageParser] 解析 result 消息');
        return {
          id: this.generateId(),
          type: 'result',
          subtype: data.subtype || 'success',
          timestamp: dayjs().toISOString(),
          sessionId: data.sessionId || '',
          isError: data.isError || false,
          content: data.content || '',
          usage: data.usage
        };
      }
      
      // 未识别的消息类型
      console.log('[NeovateMessageParser] 未识别的消息类型:', data.type);
      return null;
    } catch (error) {
      console.error('[NeovateMessageParser] 解析失败:', error);
      console.error('[NeovateMessageParser] 原始数据:', line);
      return null;
    }
  }

  /**
   * 批量解析多行输出
   * @param output 多行 JSON 字符串
   * @returns 解析后的消息数组
   */
  parseMultipleLines(output: string): ConversationMessage[] {
    const lines = output.split('\n').filter(line => line.trim());
    const messages: ConversationMessage[] = [];
    
    for (const line of lines) {
      const message = this.parseStreamLine(line);
      if (message) {
        messages.push(message);
      }
    }
    
    return messages;
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return newId();
  }
}
