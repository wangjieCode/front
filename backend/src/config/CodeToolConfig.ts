import { CodeToolConfigData } from '../types';

/**
 * 代码工具配置类
 * 负责从环境变量加载和验证代码工具配置
 */
export class CodeToolConfig {
  private toolType: string;
  private toolOptions: Record<string, any>;

  constructor() {
    this.toolType = '';
    this.toolOptions = {};
    this.loadConfig();
  }

  /**
   * 从环境变量加载配置
   */
  private loadConfig(): void {
    // 从环境变量读取工具类型，默认为 qodercli
    this.toolType = process.env.CODE_TOOL_TYPE || 'qodercli';
    
    // 读取工具特定的配置
    this.toolOptions = {
      // qodercli 配置
      qodercliPath: process.env.QODERCLI_PATH,
      qodercliArgs: process.env.QODERCLI_ARGS,
      
      // neovate 配置（与 qodercli 相同）
      neovatePath: process.env.NEOVATE_PATH,
      neovateArgs: process.env.NEOVATE_ARGS,
      
      // Cursor 配置
      cursorApiKey: process.env.CURSOR_API_KEY,
      cursorModel: process.env.CURSOR_MODEL,
      
      // Copilot 配置
      copilotApiKey: process.env.COPILOT_API_KEY,
    };
  }

  /**
   * 获取工具类型
   */
  getToolType(): string {
    return this.toolType;
  }

  /**
   * 获取工具配置选项
   */
  getToolOptions(): Record<string, any> {
    return this.toolOptions;
  }

  /**
   * 获取完整配置数据
   */
  getConfigData(): CodeToolConfigData {
    return {
      toolType: this.toolType,
      toolOptions: this.toolOptions,
    };
  }

  /**
   * 验证配置是否有效
   * @returns 验证结果，包含是否有效和错误信息
   */
  validate(): { valid: boolean; error?: string } {
    // 验证工具类型
    const supportedTools = ['qodercli', 'neovate', 'cursor', 'copilot'];
    if (!supportedTools.includes(this.toolType)) {
      return {
        valid: false,
        error: `不支持的代码工具类型: ${this.toolType}。支持的工具: ${supportedTools.join(', ')}`,
      };
    }

    // 验证工具特定的配置
    switch (this.toolType) {
      case 'qodercli':
      case 'neovate':
        // qodercli 和 neovate 不需要额外的必需配置
        break;
      
      case 'cursor':
        if (!this.toolOptions.cursorApiKey) {
          return {
            valid: false,
            error: 'Cursor 工具需要配置 CURSOR_API_KEY 环境变量',
          };
        }
        break;
      
      case 'copilot':
        if (!this.toolOptions.copilotApiKey) {
          return {
            valid: false,
            error: 'Copilot 工具需要配置 COPILOT_API_KEY 环境变量',
          };
        }
        break;
    }

    return { valid: true };
  }

  /**
   * 设置工具类型（用于测试或动态配置）
   * @param toolType 工具类型
   */
  setToolType(toolType: string): void {
    this.toolType = toolType;
  }

  /**
   * 设置工具配置选项（用于测试或动态配置）
   * @param options 配置选项
   */
  setToolOptions(options: Record<string, any>): void {
    this.toolOptions = { ...this.toolOptions, ...options };
  }
}
