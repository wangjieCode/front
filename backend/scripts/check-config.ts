#!/usr/bin/env tsx

/**
 * 配置检查脚本
 * 用于验证环境配置是否正确
 */

import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// 加载环境变量
dotenv.config({ path: resolve(__dirname, '../.env') });

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: CheckResult[] = [];

function check(name: string, condition: boolean, failMessage: string, warnMessage?: string): void {
  if (condition) {
    results.push({ name, status: 'pass', message: '✓' });
  } else if (warnMessage) {
    results.push({ name, status: 'warn', message: warnMessage });
  } else {
    results.push({ name, status: 'fail', message: failMessage });
  }
}

console.log('🔍 检查配置...\n');

// 检查 .env 文件
const envPath = resolve(__dirname, '../.env');
check(
  '.env 文件',
  existsSync(envPath),
  '❌ .env 文件不存在，请复制 .env.example 并配置'
);

// 检查服务器配置
check(
  'PORT',
  !!process.env.PORT,
  '❌ PORT 未设置',
  '⚠️  PORT 未设置，将使用默认值 3001'
);

// 检查 SSH 配置
check('SSH_HOST', !!process.env.SSH_HOST, '❌ SSH_HOST 未设置');
check('SSH_PORT', !!process.env.SSH_PORT, '❌ SSH_PORT 未设置', '⚠️  SSH_PORT 未设置，将使用默认值 22');
check('SSH_USERNAME', !!process.env.SSH_USERNAME, '❌ SSH_USERNAME 未设置');
check('SSH_PRIVATE_KEY_PATH', !!process.env.SSH_PRIVATE_KEY_PATH, '❌ SSH_PRIVATE_KEY_PATH 未设置');

if (process.env.SSH_PRIVATE_KEY_PATH) {
  check(
    'SSH 私钥文件',
    existsSync(process.env.SSH_PRIVATE_KEY_PATH),
    `❌ SSH 私钥文件不存在: ${process.env.SSH_PRIVATE_KEY_PATH}`
  );
}

// 检查 Git 配置
check('GIT_WORK_DIR', !!process.env.GIT_WORK_DIR, '❌ GIT_WORK_DIR 未设置');
check(
  'GIT_DEFAULT_BRANCH',
  !!process.env.GIT_DEFAULT_BRANCH,
  '❌ GIT_DEFAULT_BRANCH 未设置',
  '⚠️  GIT_DEFAULT_BRANCH 未设置，将使用默认值 main'
);

// 检查 GitLab 配置
check('GITLAB_URL', !!process.env.GITLAB_URL, '❌ GITLAB_URL 未设置');
check('GITLAB_TOKEN', !!process.env.GITLAB_TOKEN, '❌ GITLAB_TOKEN 未设置');
check('GITLAB_PROJECT_ID', !!process.env.GITLAB_PROJECT_ID, '❌ GITLAB_PROJECT_ID 未设置');

// 打印结果
console.log('配置检查结果:\n');

const passCount = results.filter(r => r.status === 'pass').length;
const failCount = results.filter(r => r.status === 'fail').length;
const warnCount = results.filter(r => r.status === 'warn').length;

results.forEach(result => {
  const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️ ' : '❌';
  console.log(`${icon} ${result.name}: ${result.message}`);
});

console.log(`\n总计: ${passCount} 通过, ${failCount} 失败, ${warnCount} 警告\n`);

if (failCount > 0) {
  console.error('❌ 配置检查失败！请修复上述错误后重试。');
  console.error('📖 查看 CONFIGURATION.md 获取详细配置说明。\n');
  process.exit(1);
} else if (warnCount > 0) {
  console.warn('⚠️  配置检查通过，但有警告项。');
  console.warn('📖 建议查看 CONFIGURATION.md 完善配置。\n');
  process.exit(0);
} else {
  console.log('✅ 配置检查全部通过！\n');
  process.exit(0);
}
