import { DatabaseManager } from '../src/db/DatabaseManager';
import { initializeDatabase } from '../src/db/init';
import { branches } from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function checkBranch() {
  await initializeDatabase();
  const db = DatabaseManager.getDb();
  
  const branchId = 'fa135ff6-d6ef-4f18-8ef0-4a8971074161';
  const result = await db.select().from(branches).where(eq(branches.id, branchId));
  
  console.log(`Found ${result.length} branches with ID ${branchId}`);
  if (result.length > 0) {
    console.log(JSON.stringify(result, null, 2));
  }
}

checkBranch().catch(console.error);
