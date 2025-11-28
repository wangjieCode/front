import { CodeToolConfig } from '../config/CodeToolConfig';
import { ICodeToolProvider, CodeToolResult, ICommandExecutor } from '../types';
import { QoderCliProvider } from '../providers/QoderCliProvider';
import { NeovateProvider } from '../providers/NeovateProvider';

/**
 * 代码工具服务
 * 负责加载和管理代码工具提供者
 */
export class CodeToolService {
  private provider: ICodeToolProvider;
  private config: CodeToolConfig;

  constructor(
    private executor: ICommandExecutor,
    config?: CodeToolConfig
  ) {
    this.config = config || new CodeToolConfig();
    this.provider = this.loadProvider();
  }

  /**
   * 根据配置加载代码工具提供者
   */
  private loadProvider(): ICodeToolProvider {
    const toolType = this.config.getToolType();
    console.log('[CodeToolService] 加载代码工具提供者:', toolType);
    
    switch (toolType) {
      case 'qodercli':
        console.log('[CodeToolService] ✅ 加载 QoderCliProvider');
        return new QoderCliProvider(this.executor as any);
      
      case 'neovate':
        console.log('[CodeToolService] ✅ 加载 NeovateProvider');
        return new NeovateProvider(this.executor as any);
      
      case 'cursor':
        // TODO: 实现 CursorProvider
        console.error('[CodeToolService] ❌ Cursor 工具暂未实现');
        throw new Error('Cursor 工具暂未实现');
      
      case 'copilot':
        // TODO: 实现 CopilotProvider
        console.error('[CodeToolService] ❌ Copilot 工具暂未实现');
        throw new Error('Copilot 工具暂未实现');
      
      default:
        console.error('[CodeToolService] ❌ 不支持的代码工具类型:', toolType);
        throw new Error(`不支持的代码工具类型: ${toolType}`);
    }
  }

  /**
   * 使用配置的工具修改代码
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @returns 执行结果
   */
  async modifyCode(prompt: string, workDir: string): Promise<CodeToolResult> {
    console.log('[CodeToolService] 开始 modifyCode');
    console.log('[CodeToolService] 工具:', this.provider.name);
    console.log('[CodeToolService] 提示词:', prompt.substring(0, 100) + '...');
    
    try {
      // 验证配置
      console.log('[CodeToolService] 验证配置...');
      const validation = this.config.validate();
      if (!validation.valid) {
        console.error('[CodeToolService] ❌ 配置验证失败:', validation.error);
        return {
          success: false,
          message: '配置验证失败',
          changes: [],
          error: validation.error,
        };
      }
      console.log('[CodeToolService] ✅ 配置验证通过');

      // 检查工具是否可用
      console.log('[CodeToolService] 检查工具可用性...');
      const available = await this.provider.isAvailable(workDir);
      if (!available) {
        console.error('[CodeToolService] ❌ 工具不可用:', this.provider.name);
        return {
          success: false,
          message: `代码工具 ${this.provider.name} 不可用`,
          changes: [],
          error: `请确保 ${this.provider.name} 已安装并在 PATH 中`,
        };
      }
      console.log('[CodeToolService] ✅ 工具可用');

      // 执行代码修改
      console.log('[CodeToolService] 调用 provider.modifyCode...');
      const result = await this.provider.modifyCode(prompt, workDir);
      console.log('[CodeToolService] ✅ modifyCode 完成，成功:', result.success);
      return result;
    } catch (error) {
      console.error('[CodeToolService] ❌ 执行异常:', error);
      return {
        success: false,
        message: '执行代码工具时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 使用配置的工具修改代码（流式输出）
   * @param prompt 用户提示词
   * @param workDir 工作目录
   * @param onData 数据回调
   * @param onError 错误回调
   * @returns 执行结果
   */
  async modifyCodeStream(
    prompt: string,
    workDir: string,
    onData: (data: string) => void,
    onError?: (data: string) => void
  ): Promise<CodeToolResult> {
    console.log('[CodeToolService] 开始 modifyCodeStream (流式)');
    console.log('[CodeToolService] 工具:', this.provider.name);
    
    try {
      // 验证配置
      console.log('[CodeToolService] 验证配置...');
      const validation = this.config.validate();
      if (!validation.valid) {
        console.error('[CodeToolService] ❌ 配置验证失败:', validation.error);
        return {
          success: false,
          message: '配置验证失败',
          changes: [],
          error: validation.error,
        };
      }
      console.log('[CodeToolService] ✅ 配置验证通过');

      // 检查工具是否可用
      console.log('[CodeToolService] 检查工具可用性...');
      const available = await this.provider.isAvailable(workDir);
      if (!available) {
        console.error('[CodeToolService] ❌ 工具不可用:', this.provider.name);
        return {
          success: false,
          message: `代码工具 ${this.provider.name} 不可用`,
          changes: [],
          error: `请确保 ${this.provider.name} 已安装并在 PATH 中`,
        };
      }
      console.log('[CodeToolService] ✅ 工具可用');

      // 检查提供者是否支持流式输出
      if (typeof (this.provider as any).modifyCodeStream !== 'function') {
        // 如果不支持流式，降级到同步模式
        console.warn('[CodeToolService] ⚠️ 工具不支持流式输出，降级到同步模式');
        return await this.provider.modifyCode(prompt, workDir);
      }

      // 执行代码修改（流式）
      console.log('[CodeToolService] 调用 provider.modifyCodeStream...');
      const result = await (this.provider as any).modifyCodeStream(prompt, workDir, onData, onError);
      console.log('[CodeToolService] ✅ modifyCodeStream 完成，成功:', result.success);
      return result;
    } catch (error) {
      console.error('[CodeToolService] ❌ 流式执行异常:', error);
      return {
        success: false,
        message: '执行代码工具时发生错误',
        changes: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 检查工具是否可用
   * @param workDir 工作目录
   * @returns 是否可用
   */
  async isAvailable(workDir: string): Promise<boolean> {
    try {
      return await this.provider.isAvailable(workDir);
    } catch (error) {
      console.error('检查工具可用性时出错:', error);
      return false;
    }
  }

  /**
   * 获取工具信息
   * @param workDir 工作目录
   * @returns 工具信息
   */
  async getToolInfo(workDir: string): Promise<{ 
    name: string; 
    version: string; 
    available: boolean;
  }> {
    try {
      const [version, available] = await Promise.all([
        this.provider.getVersion(workDir),
        this.provider.isAvailable(workDir),
      ]);

      return {
        name: this.provider.name,
        version,
        available,
      };
    } catch (error) {
      return {
        name: this.provider.name,
        version: 'unknown',
        available: false,
      };
    }
  }

  /**
   * 获取当前工具名称
   */
  getToolName(): string {
    return this.provider.name;
  }

  /**
   * 获取配置
   */
  getConfig(): CodeToolConfig {
    return this.config;
  }

  /**
   * 重新加载提供者（用于配置更新后）
   */
  reloadProvider(): void {
    this.provider = this.loadProvider();
  }
}
