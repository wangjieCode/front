-- D9: 补充缺失索引
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_role" ON "messages" USING btree ("conversation_id", "role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_review_diff_blobs_last_accessed_at" ON "review_diff_blobs" USING btree ("last_accessed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_review_file_changes_conversation_file_path" ON "review_file_changes" USING btree ("conversation_id", "file_path");
--> statement-breakpoint

-- D4: 删除 conversations.summary 冗余列（内容与 conversation_contexts.task_description 重复）
ALTER TABLE "conversations" DROP COLUMN IF EXISTS "summary";
--> statement-breakpoint

-- D5: 删除 messages.is_complete（始终为 true，无实际意义）
ALTER TABLE "messages" DROP COLUMN IF EXISTS "is_complete";
--> statement-breakpoint

-- D2: diff 存储从 base64 text 改为 bytea（节省 ~33% 空间，消除编解码层）
ALTER TABLE "review_diff_blobs" ADD COLUMN IF NOT EXISTS "diff_blob" bytea;
--> statement-breakpoint
UPDATE "review_diff_blobs" SET "diff_blob" = decode("diff_gzip_base64", 'base64') WHERE "diff_blob" IS NULL;
--> statement-breakpoint
ALTER TABLE "review_diff_blobs" ALTER COLUMN "diff_blob" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "review_diff_blobs" DROP COLUMN IF EXISTS "diff_gzip_base64";
--> statement-breakpoint

-- D1: 将 message_metadata 合并进 messages（消除 1:1 分表 JOIN 开销）
ALTER TABLE "messages"
  ADD COLUMN IF NOT EXISTS "tool_calls" jsonb,
  ADD COLUMN IF NOT EXISTS "code_changes" jsonb,
  ADD COLUMN IF NOT EXISTS "thinking" text,
  ADD COLUMN IF NOT EXISTS "is_question" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "question_options" jsonb,
  ADD COLUMN IF NOT EXISTS "requires_response" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "message_references" jsonb,
  ADD COLUMN IF NOT EXISTS "is_invalid" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "git_branch" varchar(255),
  ADD COLUMN IF NOT EXISTS "mr_url" text,
  ADD COLUMN IF NOT EXISTS "images" jsonb,
  ADD COLUMN IF NOT EXISTS "operation_denied" jsonb;
--> statement-breakpoint

-- D1: 迁移 message_metadata 数据到 messages
UPDATE "messages" m
SET
  tool_calls        = mm.tool_calls,
  code_changes      = mm.code_changes,
  thinking          = mm.thinking,
  is_question       = COALESCE(mm.is_question, false),
  question_options  = mm.question_options,
  requires_response = COALESCE(mm.requires_response, false),
  message_references = mm.message_references,
  is_invalid        = COALESCE(mm.is_invalid, false),
  git_branch        = mm.git_branch,
  mr_url            = mm.mr_url,
  images            = mm.images,
  operation_denied  = mm.operation_denied
FROM "message_metadata" mm
WHERE mm.message_id = m.id;
--> statement-breakpoint

-- D1: 删除 message_metadata 表
DROP TABLE IF EXISTS "message_metadata";
--> statement-breakpoint

-- D6: 添加外键约束 + CASCADE，数据库层保证引用完整性
-- 先清理可能存在的孤立数据，确保 ALTER TABLE 不报错
DELETE FROM "messages"           WHERE conversation_id NOT IN (SELECT id FROM conversations);
DELETE FROM "conversation_contexts" WHERE conversation_id NOT IN (SELECT id FROM conversations);
DELETE FROM "neovate_sessions"   WHERE conversation_id NOT IN (SELECT id FROM conversations);
DELETE FROM "review_rounds"      WHERE conversation_id NOT IN (SELECT id FROM conversations);
DELETE FROM "review_file_changes" WHERE review_round_id NOT IN (SELECT id FROM review_rounds);
--> statement-breakpoint

ALTER TABLE "messages"
  ADD CONSTRAINT "fk_messages_conversation_id"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "conversation_contexts"
  ADD CONSTRAINT "fk_conversation_contexts_conversation_id"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "neovate_sessions"
  ADD CONSTRAINT "fk_neovate_sessions_conversation_id"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "review_rounds"
  ADD CONSTRAINT "fk_review_rounds_conversation_id"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "review_file_changes"
  ADD CONSTRAINT "fk_review_file_changes_review_round_id"
  FOREIGN KEY ("review_round_id") REFERENCES "review_rounds"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "review_file_changes"
  ADD CONSTRAINT "fk_review_file_changes_diff_blob_id"
  FOREIGN KEY ("diff_blob_id") REFERENCES "review_diff_blobs"("id") ON DELETE RESTRICT;
