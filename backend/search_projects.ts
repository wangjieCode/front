import { DatabaseManager } from './src/db/DatabaseManager';
import { projects } from './src/db/schema';
import { eq, like } from 'drizzle-orm';
import dotenv from 'dotenv';
import path from 'path';

async function searchProjects() {
  dotenv.config({ path: path.resolve(__dirname, '.env.production') });
  await DatabaseManager.initialize({
    connectionString: process.env.DATABASE_URL || ''
  });
  const db = DatabaseManager.getDb();
  
  const results = await db.select().from(projects).where(like(projects.workDirectory, '%dtmall-admingit%'));
  console.log('Search in workDirectory:', JSON.stringify(results, null, 2));
  
  const results2 = await db.select().from(projects).where(like(projects.repoDir, '%dtmall-admingit%'));
  console.log('Search in repoDir:', JSON.stringify(results2, null, 2));
  
  process.exit(0);
}

searchProjects().catch(err => {
  console.error(err);
  process.exit(1);
});
