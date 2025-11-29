import * as dotenv from 'dotenv';

dotenv.config();

console.log('🔍 数据库连接诊断\n');

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('❌ DATABASE_URL 未设置');
  process.exit(1);
}

// 解析连接字符串
try {
  const url = new URL(dbUrl);
  console.log('✓ 连接字符串格式正确');
  console.log('\n连接信息：');
  console.log('  协议:', url.protocol);
  console.log('  主机:', url.hostname);
  console.log('  端口:', url.port);
  console.log('  数据库:', url.pathname);
  console.log('  用户名:', url.username);
  console.log('  密码:', url.password ? '***' + url.password.slice(-4) : '未设置');
} catch (error) {
  console.error('❌ 连接字符串格式错误:', error);
  process.exit(1);
}

console.log('\n建议：');
console.log('1. 确认 Supabase 项目正在运行');
console.log('2. 检查数据库密码是否正确');
console.log('3. 尝试在 Supabase Dashboard 的 SQL Editor 中执行查询测试');
console.log('4. 如果使用 Session Mode (端口 5432)，确保没有防火墙限制');
console.log('\n可以尝试的连接字符串格式：');
console.log('Session Mode: postgresql://postgres:[password]@db.pemhklrpojvctogksabk.supabase.co:5432/postgres');
console.log('Transaction Mode: postgresql://postgres.pemhklrpojvctogksabk:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres');
