import { DatabaseManager } from './src/db/DatabaseManager';
import { projects } from './src/db/schema';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';

async function checkProject() {
  // 加载生产环境配置
  dotenv.config({ path: path.resolve(__dirname, '.env.production') });
  
  await DatabaseManager.initialize({
    connectionString: process.env.DATABASE_URL || ''
  });
  const db = DatabaseManager.getDb();
  const projectId = 'cb5c1bf6-cbf6-42a6-ab3c-4ebc80855c34';
  
  const result = await db.select().from(projects).where(eq(projects.id, projectId));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

checkProject().catch(err => {
  console.error(err);
  process.exit(1);
});
