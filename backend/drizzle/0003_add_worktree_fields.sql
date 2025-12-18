-- 添加 users 表的 worktree_path 字段
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "worktree_path" text;

-- 添加 conversation_contexts 表的 worktree_path 字段（如果还没有）
ALTER TABLE "conversation_contexts" ADD COLUMN IF NOT EXISTS "worktree_path" text;
