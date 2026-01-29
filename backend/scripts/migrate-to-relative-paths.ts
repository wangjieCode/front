import { eq } from 'drizzle-orm';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { projects, conversationContexts, neovateSessions } from '../src/db/schema';
import { convertToProjectRelativePath } from '../src/utils/PathUtils';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ 错误: DATABASE_URL 环境变量未配置');
    process.exit(1);
  }

  // 初始化数据库连接
  DatabaseManager.initialize({
    connectionString: databaseUrl,
    max: 1
  });

  const db = DatabaseManager.getDb();
  console.log('🚀 开始全量路径相对化迁移...');

  // 1. 处理项目表
  const allProjects = await db.select().from(projects);
  console.log(`\n[Projects] 处理 ${allProjects.length} 条记录...`);
  for (const p of allProjects) {
    const relRepo = convertToProjectRelativePath(p.repoDir);
    const relWork = convertToProjectRelativePath(p.workDirectory);

    if (relRepo !== p.repoDir || relWork !== p.workDirectory) {
      console.log(`  - 项目 "${p.name}":`);
      if (relRepo !== p.repoDir) console.log(`    repoDir: [ABS] ${p.repoDir} -> [REL] ${relRepo}`);
      if (relWork !== p.workDirectory) console.log(`    workDirectory: [ABS] ${p.workDirectory} -> [REL] ${relWork}`);
      
      await db.update(projects).set({
        repoDir: relRepo || p.repoDir,
        workDirectory: relWork || p.workDirectory
      }).where(eq(projects.id, p.id));
    }
  }

  // 2. 处理对话上下文表
  const allContexts = await db.select().from(conversationContexts);
  console.log(`\n[Contexts] 处理 ${allContexts.length} 条记录...`);
  for (const ctx of allContexts) {
    const relDir = convertToProjectRelativePath(ctx.workDir);
    const relPath = convertToProjectRelativePath(ctx.worktreePath);

    if (relDir !== ctx.workDir || (ctx.worktreePath && relPath !== ctx.worktreePath)) {
      console.log(`  - 会话 "${ctx.conversationId}":`);
      if (relDir !== ctx.workDir) console.log(`    workDir: ${ctx.workDir} -> ${relDir}`);
      if (ctx.worktreePath && relPath !== ctx.worktreePath) console.log(`    worktreePath: ${ctx.worktreePath} -> ${relPath}`);

      await db.update(conversationContexts).set({
        workDir: relDir || ctx.workDir,
        worktreePath: relPath || ctx.worktreePath
      }).where(eq(conversationContexts.id, ctx.id));
    }
  }

  // 3. 处理 Neovate 会话表
  const allNeovate = await db.select().from(neovateSessions);
  console.log(`\n[Neovate] 处理 ${allNeovate.length} 条记录...`);
  for (const s of allNeovate) {
    const relDir = convertToProjectRelativePath(s.workDir);
    if (relDir !== s.workDir) {
      console.log(`  - Neovate Session "${s.neovateSessionId}": ${s.workDir} -> ${relDir}`);
      await db.update(neovateSessions).set({
        workDir: relDir || s.workDir
      }).where(eq(neovateSessions.id, s.id));
    }
  }

  console.log('\n✨ 所有路径已成功转为相对路径存储。');
  process.exit(0);
}

migrate().catch(err => {
  console.error('\n❌ 迁移过程中发生错误:', err);
  process.exit(1);
});
