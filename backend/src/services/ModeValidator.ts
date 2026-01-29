import { ConversationMode, OperationType, ValidationResult } from '../types';

/**
 * 模式验证器类
 * 负责验证操作是否在当前模式下允许
 */
export class ModeValidator {
  // 编辑模式允许的操作
  private static readonly EDIT_MODE_OPERATIONS: OperationType[] = [
    OperationType.READ_FILE,
    OperationType.SEARCH_CODE,
    OperationType.MODIFY_CODE,
    OperationType.CREATE_FILE,
    OperationType.DELETE_FILE,
    OperationType.CREATE_BRANCH,
    OperationType.CREATE_MR,
  ];

  // 只读模式允许的操作
  private static readonly READONLY_MODE_OPERATIONS: OperationType[] = [
    OperationType.READ_FILE,
    OperationType.SEARCH_CODE,
  ];

  /**
   * 验证操作是否在当前模式下允许
   * @param mode 对话模式
   * @param operation 操作类型
   * @returns 验证结果
   */
  validateOperation(
    mode: ConversationMode,
    operation: OperationType
  ): ValidationResult {
    const allowedOperations = this.getAllowedOperations(mode);
    const allowed = allowedOperations.includes(operation);

    if (!allowed) {
      const reason = this.getOperationDeniedReason(mode, operation);
      return { allowed: false, reason };
    }

    return { allowed: true };
  }

  /**
   * 获取模式允许的操作列表
   * @param mode 对话模式
   * @returns 允许的操作类型列表
   */
  getAllowedOperations(mode: ConversationMode): OperationType[] {
    switch (mode) {
      case ConversationMode.EDIT:
        return ModeValidator.EDIT_MODE_OPERATIONS;
      case ConversationMode.READONLY:
        return ModeValidator.READONLY_MODE_OPERATIONS;
      default:
        return [];
    }
  }

  /**
   * 获取操作被拒绝的原因
   * @param mode 对话模式
   * @param operation 操作类型
   * @returns 拒绝原因
   */
  private getOperationDeniedReason(
    mode: ConversationMode,
    operation: OperationType
  ): string {
    if (mode === ConversationMode.READONLY) {
      const operationNames: Record<OperationType, string> = {
        [OperationType.READ_FILE]: '读取文件',
        [OperationType.SEARCH_CODE]: '搜索代码',
        [OperationType.MODIFY_CODE]: '修改代码',
        [OperationType.CREATE_FILE]: '创建文件',
        [OperationType.DELETE_FILE]: '删除文件',
        [OperationType.CREATE_BRANCH]: '创建分支',
        [OperationType.CREATE_MR]: '创建 MR',
        [OperationType.PREVIEW_PROJECT]: '预览项目',
      };

      const operationName = operationNames[operation] || operation;

      return `当前对话处于只读模式，无法执行"${operationName}"操作。如需修改代码，请创建新的编辑模式对话。`;
    }

    return `操作 ${operation} 在模式 ${mode} 下不被允许`;
  }

  /**
   * 检查操作是否为修改类操作
   * @param operation 操作类型
   * @returns 是否为修改类操作
   */
  isModifyOperation(operation: OperationType): boolean {
    const modifyOperations = [
      OperationType.MODIFY_CODE,
      OperationType.CREATE_FILE,
      OperationType.DELETE_FILE,
    ];
    return modifyOperations.includes(operation);
  }

  /**
   * 检查操作是否为 Git 操作
   * @param operation 操作类型
   * @returns 是否为 Git 操作
   */
  isGitOperation(operation: OperationType): boolean {
    const gitOperations = [
      OperationType.CREATE_BRANCH,
      OperationType.CREATE_MR,
    ];
    return gitOperations.includes(operation);
  }

  /**
   * 检查操作是否为查询类操作
   * @param operation 操作类型
   * @returns 是否为查询类操作
   */
  isQueryOperation(operation: OperationType): boolean {
    const queryOperations = [
      OperationType.READ_FILE,
      OperationType.SEARCH_CODE,
    ];
    return queryOperations.includes(operation);
  }
}
