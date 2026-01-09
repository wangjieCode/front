import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL || '');

/**
 * 从任务描述中提取标题（取前50个字符）
 */
function extractTitle(taskDescription) {
  if (!taskDescription) return '';
  
  // 移除多余的空白字符
  const cleaned = taskDescription.trim().replace(/\s+/g, ' ');
  
  // 如果长度小于等于50，直接返回
  if (cleaned.length <= 50) {
    return cleaned;
  }
  
  // 截取前50个字符，并在合适的位置断开
  let title = cleaned.substring(0, 50);
  const lastSpace = title.lastIndexOf(' ');
  
  // 如果在前40个字符内找到空格，在空格处断开
  if (lastSpace > 30) {
    title = title.substring(0, lastSpace);
  }
  
  return title + '...';
}

async function updateConversationFields() {
  try {
    console.log('🚀 开始更新对话表字段...');

    // 1. 添加新字段
    console.log('📝 添加新字段...');
    await sql`
      ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_id" uuid;
    `;
    await sql`
      ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "title" varchar(500);
    `;
    await sql`
      ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" text;
    `;
    await sql`
      ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_name" varchar(255);
    `;

    // 2. 添加索引
    console.log('📊 添加索引...');
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_conversations_project_id" ON "conversations" ("project_id");
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS "idx_conversations_title" ON "conversations" ("title");
    `;

    // 3. 更新现有数据
    console.log('🔄 更新现有对话数据...');
    
    // 获取所有现有对话
    const conversations = await sql`
      SELECT c.id, c.task_id, cc.task_description, cc.work_dir
      FROM conversations c
      LEFT JOIN conversation_contexts cc ON c.id = cc.conversation_id
      WHERE c.title IS NULL OR c.summary IS NULL OR c.project_name IS NULL
    `;

    console.log(`📋 找到 ${conversations.length} 条需要更新的对话记录`);

    // 批量更新对话数据
    for (const conv of conversations) {
      const title = extractTitle(conv.task_description || '');
      const summary = conv.task_description || '';
      const projectName = conv.work_dir ? conv.work_dir.split('/').pop() || '' : '';

      await sql`
        UPDATE conversations 
        SET 
          title = ${title},
          summary = ${summary},
          project_name = ${projectName}
        WHERE id = ${conv.id}
      `;
    }

    console.log('✅ 对话表字段更新完成');
    console.log(`📊 更新了 ${conversations.length} 条对话记录`);

    // 4. 验证更新结果
    const updatedCount = await sql`
      SELECT COUNT(*) as count 
      FROM conversations 
      WHERE title IS NOT NULL AND summary IS NOT NULL
    `;
    
    console.log(`🔍 验证结果: ${updatedCount[0].count} 条记录已成功更新`);

  } catch (error) {
    console.error('❌ 更新失败:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

// 执行更新
updateConversationFields()
  .then(() => {
    console.log('🎉 数据库更新完成');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 数据库更新失败:', error);
    process.exit(1);
  });