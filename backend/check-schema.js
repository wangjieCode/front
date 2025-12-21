import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL || '');

async function checkSchema() {
  try {
    const result = await sql`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'projects'
      ORDER BY ordinal_position
    `;
    console.log('projects表结构:');
    console.table(result);
  } catch (error) {
    console.error('查询失败:', error);
  } finally {
    await sql.end();
  }
}

checkSchema();