-- 为 conversations 表添加展示相关字段
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "title" varchar(500);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" text;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_name" varchar(255);

-- 添加索引
CREATE INDEX IF NOT EXISTS "idx_conversations_project_id" ON "conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_title" ON "conversations" ("title");