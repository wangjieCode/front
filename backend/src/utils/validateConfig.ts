import { existsSync } from 'fs';

/**
 * 配置验证结果接口
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * 验证所有配置
 * @returns 验证结果
 */
export function validateAllConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 验证服务器配置
  if (!process.env.PORT) {
    warnings.push('PORT 未设置，将使用默认值 3001');
  }

  // 验证 SSH 配置
  if (!process.env.SSH_HOST) {
    errors.push('SSH_HOST 未设置');
  }
  if (!process.env.SSH_PORT) {
    warnings.push('SSH_PORT 未设置，将使用默认值 22');
  }
  if (!process.env.SSH_USERNAME) {
    errors.push('SSH_USERNAME 未设置');
  }
  if (!process.env.SSH_PRIVATE_KEY_PATH) {
    errors.push('SSH_PRIVATE_KEY_PATH 未设置');
  } else if (!existsSync(process.env.SSH_PRIVATE_KEY_PATH)) {
    errors.push(`SSH 私钥文件不存在: ${process.env.SSH_PRIVATE_KEY_PATH}`);
  }

  // 验证 Git 配置
  if (!process.env.GIT_WORK_DIR) {
    errors.push('GIT_WORK_DIR 未设置');
  }
  if (!process.env.GIT_DEFAULT_BRANCH) {
    warnings.push('GIT_DEFAULT_BRANCH 未设置，将使用默认值 main');
  }

  // 验证 GitLab 配置
  if (!process.env.GITLAB_URL) {
    errors.push('GITLAB_URL 未设置');
  }
  if (!process.env.GITLAB_TOKEN) {
    errors.push('GITLAB_TOKEN 未设置');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 打印配置验证结果
 * @param result 验证结果
 */
export function printValidationResult(result: ConfigValidationResult): void {
  if (result.valid) {
    console.log('✅ 配置验证通过');
  } else {
    console.error('❌ 配置验证失败:');
    result.errors.forEach((error) => {
      console.error(`  - ${error}`);
    });
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  配置警告:');
    result.warnings.forEach((warning) => {
      console.warn(`  - ${warning}`);
    });
  }
}
