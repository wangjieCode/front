#!/usr/bin/env node

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const sql = postgres(process.env.DATABASE_URL || '');

async function fixProjectNames() {
  try {
    console.log('🔧 修复对话中的项目名称...');

    // 1. 获取所有对话及其关联的项目信息
    const conversations = await sql`
      SELECT 
        c.id,
        c.project_name as current_project_name,
        cc.work_dir,
        p.name as real_project_name,
        p.id as project_id
      FROM conversations c
      LEFT JOIN conversation_contexts cc ON c.id = cc.conversation_id
      LEFT JOIN projects p ON (
        cc.work_dir LIKE '%' || p.name || '%' OR
        cc.work_dir LIKE '%dtmall-admin%' OR
        cc.work_dir LIKE '%uni-mall%'
      )
      WHERE c.project_name IS NOT NULL
      ORDER BY c.created_at DESC
    `;

    console.log(`📋 找到 ${conversations.length} 条对话记录`);

    let updatedCount = 0;

    // 2. 更新项目名称
    for (const conv of conversations) {
      let newProjectName = conv.current_project_name;
      let projectId = conv.project_id;

      // 如果找到了真实的项目信息，使用它
      if (conv.real_project_name) {
        newProjectName = conv.real_project_name;
        projectId = conv.project_id;
      } else {
        // 根据 work_dir 推断项目名称
        if (conv.work_dir) {
          if (conv.work_dir.includes('dtmall-admin')) {
            newProjectName = 'dtmall-admin';
            // 查找 dtmall-admin 项目的ID
            const project = await sql`
              SELECT id FROM projects WHERE name = 'dtmall-admin' LIMIT 1
            `;
            if (project.length > 0) {
              projectId = project[0].id;
            }
          } else if (conv.work_dir.includes('uni-mall')) {
            newProjectName = 'uni-mall';
            // 查找 uni-mall 项目的ID
            const project = await sql`
              SELECT id FROM projects WHERE name LIKE '%uni-mall%' LIMIT 1
            `;
            if (project.length > 0) {
              projectId = project[0].id;
            }
          } else {
            // 尝试从路径中提取更合理的项目名称
            const pathParts = conv.work_dir.split('/');
            // 查找包含项目名称的部分（通常不是用户ID）
            for (const part of pathParts) {
              if (part && !part.startsWith('user-') && part !== 'worktrees' && part !== 'workspace') {
                newProjectName = part;
                break;
              }
            }
          }
        }
      }

      // 只有当项目名称发生变化时才更新
      if (newProjectName !== conv.current_project_name || projectId !== conv.project_id) {
        await sql`
          UPDATE conversations 
          SET 
            project_name = ${newProjectName},
            project_id = ${projectId}
          WHERE id = ${conv.id}
        `;
        
        console.log(`✅ 更新对话 ${conv.id}: "${conv.current_project_name}" → "${newProjectName}"`);
        updatedCount++;
      }
    }

    console.log(`🎉 修复完成，共更新了 ${updatedCount} 条记录`);

    // 3. 显示更新后的统计
    const stats = await sql`
      SELECT project_name, COUNT(*) as count
      FROM conversations 
      WHERE project_name IS NOT NULL
      GROUP BY project_name
      ORDER BY count DESC
    `;

    console.log('\n📊 项目名称统计:');
    for (const stat of stats) {
      console.log(`  ${stat.project_name}: ${stat.count} 个对话`);
    }

  } catch (error) {
    console.error('❌ 修复失败:', error);
    throw error;
  } finally {
    await sql.end();
  }
}

fixProjectNames();