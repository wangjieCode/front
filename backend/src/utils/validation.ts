/**
 * 验证错误类
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 验证提示词
 * @param prompt 用户输入的提示词
 * @throws {ValidationError} 如果提示词无效
 */
export function validatePrompt(prompt: string): void {
  // 检查是否为空或仅包含空白字符
  if (!prompt || prompt.trim().length === 0) {
    throw new ValidationError('提示词不能为空');
  }

  // 检查长度限制
  if (prompt.length > 5000) {
    throw new ValidationError('提示词长度不能超过 5000 字符');
  }
}

/**
 * 验证任务 ID
 * @param taskId 任务 ID
 * @throws {ValidationError} 如果任务 ID 无效
 */
export function validateTaskId(taskId: string): void {
  if (!taskId || taskId.trim().length === 0) {
    throw new ValidationError('任务 ID 不能为空');
  }
}

/**
 * 检查字符串是否仅包含空白字符
 * @param str 要检查的字符串
 * @returns 如果仅包含空白字符返回 true
 */
export function isWhitespaceOnly(str: string): boolean {
  return str.trim().length === 0;
}
