/**
 * Neovate 会话 ID 提取工具
 */

/**
 * 从 Neovate 输出中提取会话 ID
 * 
 * Neovate 的输出格式为 JSON 数组，每个元素可能包含 sessionId 字段
 * 例如：[{"type":"system","subtype":"init","sessionId":"cf00503d",...}, ...]
 * 
 * @param output Neovate 的原始输出
 * @returns 会话 ID，如果未找到返回 null
 */
export function extractSessionId(output: string): string | null {
  if (!output || output.trim().length === 0) {
    console.log('[NeovateSessionExtractor] 输出为空');
    return null;
  }

  try {
    // 方法 1: 尝试解析为 JSON 数组
    if (output.trim().startsWith('[')) {
      const messages = JSON.parse(output);
      if (Array.isArray(messages)) {
        // 遍历所有消息，查找包含 sessionId 的消息
        for (const message of messages) {
          if (message.sessionId && typeof message.sessionId === 'string') {
            console.log(`[NeovateSessionExtractor] 从 JSON 提取会话 ID: ${message.sessionId}`);
            return message.sessionId;
          }
        }
      }
    }

    // 方法 2: 尝试解析为单个 JSON 对象
    if (output.trim().startsWith('{')) {
      const message = JSON.parse(output);
      if (message.sessionId && typeof message.sessionId === 'string') {
        console.log(`[NeovateSessionExtractor] 从 JSON 对象提取会话 ID: ${message.sessionId}`);
        return message.sessionId;
      }
    }

    // 方法 3: 使用正则表达式从文本中提取
    // 支持多种可能的格式：
    // - "sessionId":"cf00503d"
    // - sessionId: cf00503d
    // - Session ID: cf00503d
    const patterns = [
      /"sessionId"\s*:\s*"([a-zA-Z0-9-]+)"/,  // JSON 格式
      /sessionId\s*:\s*([a-zA-Z0-9-]+)/i,     // 无引号格式
      /session\s+id\s*:\s*([a-zA-Z0-9-]+)/i,  // 带空格格式
      /session[_-]?id[:\s]+([a-zA-Z0-9-]+)/i, // 各种分隔符
    ];

    for (const pattern of patterns) {
      const match = output.match(pattern);
      if (match && match[1]) {
        console.log(`[NeovateSessionExtractor] 从文本提取会话 ID: ${match[1]}`);
        return match[1];
      }
    }

    console.log('[NeovateSessionExtractor] 未找到会话 ID');
    return null;
  } catch (error) {
    console.error('[NeovateSessionExtractor] 提取会话 ID 失败:', error);
    return null;
  }
}

/**
 * 验证会话 ID 格式是否有效
 * 
 * 有效的会话 ID 应该：
 * - 长度在 4-64 个字符之间
 * - 只包含字母、数字和连字符
 * 
 * @param sessionId 会话 ID
 * @returns 是否有效
 */
export function isValidSessionId(sessionId: string | null): boolean {
  if (!sessionId) {
    return false;
  }

  // 检查长度
  if (sessionId.length < 4 || sessionId.length > 64) {
    return false;
  }

  // 检查字符（只允许字母、数字和连字符）
  const validPattern = /^[a-zA-Z0-9-]+$/;
  return validPattern.test(sessionId);
}

/**
 * 从流式输出中提取会话 ID
 * 
 * 流式输出可能是多行的，每行可能是一个 JSON 对象
 * 
 * @param streamOutput 流式输出的累积内容
 * @returns 会话 ID，如果未找到返回 null
 */
export function extractSessionIdFromStream(streamOutput: string): string | null {
  if (!streamOutput || streamOutput.trim().length === 0) {
    return null;
  }

  // 按行分割
  const lines = streamOutput.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const sessionId = extractSessionId(line);
    if (sessionId && isValidSessionId(sessionId)) {
      return sessionId;
    }
  }

  // 如果按行提取失败，尝试整体提取
  const sessionId = extractSessionId(streamOutput);
  
  // 验证提取的会话 ID
  if (sessionId && isValidSessionId(sessionId)) {
    return sessionId;
  }
  
  return null;
}
