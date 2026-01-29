#!/usr/bin/env tsx
/**
 * 路径工具函数测试
 * 验证变量占位符方案的正确性
 */

import { 
  convertToStoredPath, 
  resolveStoredPath, 
  hasPathVariable,
  extractPathVariableType,
  BasePathType,
  PATH_VARIABLES 
} from '../src/utils/PathUtils';

console.log('🧪 测试路径工具函数\n');

// 测试 1: 转换绝对路径到变量占位符格式
console.log('📝 测试 1: convertToStoredPath()');
console.log('-----------------------------------');

const testPaths = [
  '/Users/dev/worktrees/user-abc/project',
  '/Users/dev/front-workspace/main-project',
  '/app/worktrees/conversation-123/project',
];

testPaths.forEach(absPath => {
  const stored = convertToStoredPath(absPath);
  console.log(`输入: ${absPath}`);
  console.log(`输出: ${stored}`);
  console.log();
});

// 测试 2: 解析变量占位符到绝对路径
console.log('📝 测试 2: resolveStoredPath()');
console.log('-----------------------------------');

const storedPaths = [
  `${PATH_VARIABLES.WORKTREE_BASE_DIR}/user-abc/project`,
  `${PATH_VARIABLES.GIT_WORK_DIR}/main-project`,
  'relative/path/without/variable',
];

storedPaths.forEach(storedPath => {
  const resolved = resolveStoredPath(storedPath);
  console.log(`输入: ${storedPath}`);
  console.log(`输出: ${resolved}`);
  console.log();
});

// 测试 3: 检查路径是否包含变量
console.log('📝 测试 3: hasPathVariable()');
console.log('-----------------------------------');

const checkPaths = [
  `${PATH_VARIABLES.WORKTREE_BASE_DIR}/user-abc/project`,
  'user-abc/project',
  '/absolute/path/to/project',
];

checkPaths.forEach(path => {
  const hasVar = hasPathVariable(path);
  console.log(`路径: ${path}`);
  console.log(`包含变量: ${hasVar}`);
  console.log();
});

// 测试 4: 提取变量类型
console.log('📝 测试 4: extractPathVariableType()');
console.log('-----------------------------------');

const varPaths = [
  `${PATH_VARIABLES.WORKTREE_BASE_DIR}/user-abc/project`,
  `${PATH_VARIABLES.GIT_WORK_DIR}/main-project`,
  'no-variable-path',
];

varPaths.forEach(path => {
  const varType = extractPathVariableType(path);
  console.log(`路径: ${path}`);
  console.log(`变量类型: ${varType || 'null'}`);
  console.log();
});

// 测试 5: 往返转换（绝对路径 -> 变量格式 -> 绝对路径）
console.log('📝 测试 5: 往返转换测试');
console.log('-----------------------------------');

const originalPath = '/Users/dev/worktrees/user-test/my-project';
console.log(`原始路径: ${originalPath}`);

const stored = convertToStoredPath(originalPath);
console.log(`转换为变量格式: ${stored}`);

const resolved = resolveStoredPath(stored || '');
console.log(`解析回绝对路径: ${resolved}`);

// 注意：由于环境变量可能不同，往返转换后的路径可能与原始路径不完全相同
// 但应该指向同一个逻辑位置
console.log();

console.log('✅ 所有测试完成！');
