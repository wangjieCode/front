
import { DatabaseManager } from '../src/db/DatabaseManager';
import { loadDatabaseConfig } from '../src/config/database';
import postgres from 'postgres';

async function listTables() {
  const config = loadDatabaseConfig();
  DatabaseManager.initialize(config);
  
  const sql = DatabaseManager.getClient();
  
  try {
    const tables = await sql`
      SELECT tablename as table_name, schemaname as table_schema
      FROM pg_catalog.pg_tables 
      ORDER BY schemaname, tablename
    `;
    
    console.log('--- All Database Tables ---');
    tables.forEach((row: any, index: number) => {
      console.log(`${index + 1}. [${row.table_schema}] ${row.table_name}`);
    });
    console.log(`\nTotal: ${tables.length} tables`);
  } catch (error) {
    console.error('Error listing tables:', error);
  } finally {
    await DatabaseManager.close();
  }
}

listTables();
