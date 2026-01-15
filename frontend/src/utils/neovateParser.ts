/**
 * Neovate Stream-JSON 格式解析器
 * 用于解析 Neovate AI 返回的 stream-json 格式数据
 */

export interface NeovateMessage {
  type: string;
  role?: string;
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: any;
    description?: string;
    toolCallId?: string;
    toolName?: string;
    result?: any;
    [key: string]: any;
  }>;
  text?: string;
  [key: string]: any;
}

export interface ParsedContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  toolName?: string;
  toolInput?: any;
  toolDescription?: string;
  toolResult?: any;
  toolCallId?: string;
}

/**
 * 解析 Neovate stream-json 格式的内容为结构化数据
 * @param rawContent 原始的 stream-json 格式内容（每行一个 JSON）
 * @returns 解析后的结构化内容数组
 */
export function parseNeovateStreamJsonStructured(rawContent: string): ParsedContent[] {
  if (!rawContent || typeof rawContent !== 'string') {
    return [];
  }

  const lines = rawContent.trim().split('\n').filter(line => line.trim());
  const contents: ParsedContent[] = [];

  for (const line of lines) {
    try {
      if (!line.trim().startsWith('{')) {
        continue;
      }

      const event: NeovateMessage = JSON.parse(line);

      // 处理 assistant 消息
      if (event.role === 'assistant' && Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === 'text' && block.text) {
            contents.push({
              type: 'text',
              text: block.text,
            });
          } else if (block.type === 'tool_use') {
            contents.push({
              type: 'tool_use',
              toolName: block.name,
              toolInput: block.input,
              toolDescription: block.description,
              toolCallId: block.id,
            });
          }
        }
      }

      // 处理 tool 消息（工具执行结果）
      if (event.role === 'tool' && Array.isArray(event.content)) {
        for (const block of event.content) {
          if (block.type === 'tool-result') {
            contents.push({
              type: 'tool_result',
              toolName: block.toolName,
              toolCallId: block.toolCallId,
              toolResult: block.result,
            });
          }
        }
      }
    } catch (e) {
      console.debug('[NeovateParser] 跳过无法解析的行:', line.substring(0, 100));
    }
  }

  return contents;
}

/**
 * 解析为纯文本（向后兼容）
 */
export function parseNeovateStreamJson(rawContent: string): string {
  const contents = parseNeovateStreamJsonStructured(rawContent);
  return contents
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');
}

/**
 * 实时解析流式数据块为结构化数据
 */
export function parseNeovateChunkStructured(chunk: string): ParsedContent[] {
  try {
    if (!chunk.trim().startsWith('{')) {
      return [];
    }

    const event: NeovateMessage = JSON.parse(chunk);
    const contents: ParsedContent[] = [];

    // 处理 assistant 消息
    if (event.role === 'assistant' && Array.isArray(event.content)) {
      for (const block of event.content) {
        if (block.type === 'text' && block.text) {
          contents.push({
            type: 'text',
            text: block.text,
          });
        } else if (block.type === 'tool_use') {
          contents.push({
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            toolDescription: block.description,
            toolCallId: block.id,
          });
        }
      }
    }

    // 处理 tool 消息
    if (event.role === 'tool' && Array.isArray(event.content)) {
      for (const block of event.content) {
        if (block.type === 'tool-result') {
          contents.push({
            type: 'tool_result',
            toolName: block.toolName,
            toolCallId: block.toolCallId,
            toolResult: block.result,
          });
        }
      }
    }

    return contents;
  } catch (e) {
    console.debug('[NeovateParser] 解析 chunk 失败:', e);
    return [];
  }
}

/**
 * 实时解析流式数据块（纯文本，向后兼容）
 */
export function parseNeovateChunk(chunk: string): string {
  const contents = parseNeovateChunkStructured(chunk);
  return contents
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('');
}

/**
 * 检查内容是否为 stream-json 格式
 */
export function isStreamJsonFormat(content: string): boolean {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const lines = content.trim().split('\n');
  
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.startsWith('{')) {
      try {
        JSON.parse(firstLine);
        return true;
      } catch (e) {
        return false;
      }
    }
  }

  return false;
}
