import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL || '');

async function createTables() {
  try {
    // 创建projects表
    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        name varchar(255) NOT NULL,
        description text,
        git_repository_url varchar(500) NOT NULL,
        git_branch varchar(100) DEFAULT 'main',
        gitlab_project_id varchar(100),
        gitlab_url varchar(500),
        work_directory varchar(500) NOT NULL,
        owner_id uuid NOT NULL,
        is_active boolean DEFAULT true,
        created_at timestamp with time zone DEFAULT now() NOT NULL,
        updated_at timestamp with time zone DEFAULT now() NOT NULL
      )
    `;

    // 移除project_members表创建逻辑

    console.log('✅ 数据库表创建成功');
  } catch (error) {
    console.error('❌ 创建表失败:', error);
  } finally {
    await sql.end();
  }
}

createTables();