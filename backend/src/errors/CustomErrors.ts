/**
 * 自定义错误类
 */

/**
 * 验证错误
 * 当操作在当前模式下不被允许时抛出
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 不可变字段错误
 * 当尝试修改不可变字段时抛出
 */
export class ImmutableFieldError extends Error {
  constructor(fieldName: string) {
    super(`字段 "${fieldName}" 在创建后无法修改`);
    this.name = 'ImmutableFieldError';
  }
}

/**
 * Git 操作错误
 * 当 Git 操作失败时抛出
 */
export class GitOperationError extends Error {
  constructor(operation: string, details?: string) {
    super(`Git 操作失败: ${operation}${details ? ` - ${details}` : ''}`);
    this.name = 'GitOperationError';
  }
}
