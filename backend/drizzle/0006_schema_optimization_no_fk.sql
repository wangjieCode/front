-- 字段收敛：统一默认值与非空约束
UPDATE "message_metadata" SET "is_question" = false WHERE "is_question" IS NULL;
UPDATE "message_metadata" SET "requires_response" = false WHERE "requires_response" IS NULL;
UPDATE "message_metadata" SET "is_invalid" = false WHERE "is_invalid" IS NULL;
UPDATE "projects" SET "is_active" = true WHERE "is_active" IS NULL;
UPDATE "conversations" SET "status" = 'active' WHERE "status" IS NULL;

ALTER TABLE "message_metadata" ALTER COLUMN "is_question" SET DEFAULT false;
ALTER TABLE "message_metadata" ALTER COLUMN "is_question" SET NOT NULL;
ALTER TABLE "message_metadata" ALTER COLUMN "requires_response" SET DEFAULT false;
ALTER TABLE "message_metadata" ALTER COLUMN "requires_response" SET NOT NULL;
ALTER TABLE "message_metadata" ALTER COLUMN "is_invalid" SET DEFAULT false;
ALTER TABLE "message_metadata" ALTER COLUMN "is_invalid" SET NOT NULL;

ALTER TABLE "projects" ALTER COLUMN "is_active" SET DEFAULT true;
ALTER TABLE "projects" ALTER COLUMN "is_active" SET NOT NULL;

ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'active';
ALTER TABLE "conversations" ALTER COLUMN "visibility" SET DEFAULT 'private';

-- 索引瘦身：删除冗余或低收益索引
DROP INDEX IF EXISTS "idx_users_username";
DROP INDEX IF EXISTS "idx_conversations_status";
DROP INDEX IF EXISTS "idx_conversations_visibility";
DROP INDEX IF EXISTS "idx_conversations_title";
DROP INDEX IF EXISTS "idx_contexts_conversation_id";
DROP INDEX IF EXISTS "idx_contexts_mode";
DROP INDEX IF EXISTS "idx_messages_conversation_id";
DROP INDEX IF EXISTS "idx_messages_timestamp";
DROP INDEX IF EXISTS "idx_metadata_message_id";
DROP INDEX IF EXISTS "idx_metadata_is_question";
DROP INDEX IF EXISTS "idx_metadata_requires_response";
DROP INDEX IF EXISTS "idx_projects_name";
DROP INDEX IF EXISTS "idx_projects_is_active";
DROP INDEX IF EXISTS "idx_neovate_sessions_conversation_id";

-- 伪唯一索引升级为真实唯一索引
DROP INDEX IF EXISTS "unique_contexts_conversation_id";
CREATE UNIQUE INDEX IF NOT EXISTS "unique_contexts_conversation_id" ON "conversation_contexts" USING btree ("conversation_id");

DROP INDEX IF EXISTS "unique_neovate_sessions_conversation_id";
CREATE UNIQUE INDEX IF NOT EXISTS "unique_neovate_sessions_conversation_id" ON "neovate_sessions" USING btree ("conversation_id");

DROP INDEX IF EXISTS "unique_metadata_message_id";
CREATE UNIQUE INDEX IF NOT EXISTS "unique_metadata_message_id" ON "message_metadata" USING btree ("message_id");

-- 新增复合索引（高频查询路径）
CREATE INDEX IF NOT EXISTS "idx_conversations_user_visibility_created_at" ON "conversations" USING btree ("user_id", "visibility", "created_at");
CREATE INDEX IF NOT EXISTS "idx_projects_is_active_created_at" ON "projects" USING btree ("is_active", "created_at");
