/**
 * 检查数据库中的数据
 */
import { initializeDatabase, closeDatabase } from '../src/db/init';
import { DrizzleConversationStorage } from '../src/storage/DrizzleConversationStorage';

async function checkData() {
  console.log('📊 检查数据库数据\n');

  try {
    await initializeDatabase();
    const storage = new DrizzleConversationStorage();

    // 查询所有会话
    const sessions = await storage.listSessions();
    console.log(`会话总数: ${sessions.length}`);
    
    if (sessions.length > 0) {
      console.log('\n会话列表:');
      sessions.forEach((session, index) => {
        console.log(`  ${index + 1}. ${session.sessionId} - ${session.status}`);
      });
    }

    await closeDatabase();
    process.exit(0);
  } catch (error) {
    console.error('错误:', error);
    await closeDatabase();
    process.exit(1);
  }
}

checkData();
