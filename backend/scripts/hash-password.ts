#!/usr/bin/env tsx

import bcrypt from 'bcrypt';

/**
 * 密码哈希生成脚本
 * 用于为手动创建用户生成密码哈希值
 * 
 * 使用方式：
 * pnpm run hash-password "您的密码"
 */

async function hashPassword() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      console.log('');
      console.log('密码哈希生成工具');
      console.log('==================');
      console.log('');
      console.log('使用方式：');
      console.log('  pnpm run hash-password "您的密码"');
      console.log('');
      console.log('示例：');
      console.log('  pnpm run hash-password "mySecurePassword123"');
      console.log('');
      process.exit(1);
    }

    const password = args[0];

    // 验证密码强度
    if (password.length < 8) {
      console.error('❌ 密码长度不能少于 8 位');
      process.exit(1);
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    
    if (!hasLetter || !hasNumber) {
      console.warn('⚠️  警告：建议密码包含字母和数字');
    }

    // 生成哈希值
    const saltRounds = 10;
    const hash = await bcrypt.hash(password, saltRounds);

    console.log('');
    console.log('✅ 密码哈希生成成功！');
    console.log('');
    console.log('密码哈希值：');
    console.log(hash);
    console.log('');
    console.log('请将此哈希值插入到 users 表的 password_hash 字段');
    console.log('');
    console.log('SQL 示例：');
    console.log(`INSERT INTO users (username, password_hash, email, status)`);
    console.log(`VALUES ('username', '${hash}', 'user@example.com', 'active');`);
    console.log('');
  } catch (error) {
    console.error('❌ 生成密码哈希失败:', error);
    process.exit(1);
  }
}

hashPassword();
