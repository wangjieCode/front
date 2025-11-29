-- 添加对话模式支持的迁移脚本

-- 1. 在 conversation_contexts 表中添加 mode 字段
ALTER TABLE "conversation_contexts" 
ADD COLUMN "mode" varchar(50) NOT NULL DEFAULT 'edit';

-- 2. 在 conversation_contexts 表中添加 context_git_branch 字段
ALTER TABLE "conversation_contexts" 
ADD COLUMN "context_git_branch" varchar(255);

-- 3. 在 conversation_contexts 表中添加 mr_url 字段
ALTER TABLE "conversation_contexts" 
ADD COLUMN "mr_url" text;

-- 4. 在 message_metadata 表中添加 git_branch 字段
ALTER TABLE "message_metadata" 
ADD COLUMN "git_branch" varchar(255);

-- 5. 在 message_metadata 表中添加 mr_url 字段
ALTER TABLE "message_metadata" 
ADD COLUMN "mr_url" text;

-- 6. 在 message_metadata 表中添加 operation_denied 字段
ALTER TABLE "message_metadata" 
ADD COLUMN "operation_denied" jsonb;

-- 7. 创建 mode 字段的索引
CREATE INDEX IF NOT EXISTS "idx_contexts_mode" ON "conversation_contexts" ("mode");

-- 8. 为现有数据设置默认模式为 'edit'
UPDATE "conversation_contexts" 
SET "mode" = 'edit' 
WHERE "mode" IS NULL;

-- 9. 添加注释
COMMENT ON COLUMN "conversation_contexts"."mode" IS '对话模式：edit（编辑模式）或 readonly（只读模式）';
COMMENT ON COLUMN "conversation_contexts"."context_git_branch" IS '编辑模式下创建的 Git 分支';
COMMENT ON COLUMN "conversation_contexts"."mr_url" IS '编辑模式下创建的 MR URL';
COMMENT ON COLUMN "message_metadata"."git_branch" IS '消息关联的 Git 分支';
COMMENT ON COLUMN "message_metadata"."mr_url" IS '消息关联的 MR URL';
COMMENT ON COLUMN "message_metadata"."operation_denied" IS '操作被拒绝的信息（JSON 格式）';
