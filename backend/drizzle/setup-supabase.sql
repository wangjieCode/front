-- Supabase 数据库设置脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- 访问: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/sql/new

-- 1. 创建 conversations 表
CREATE TABLE IF NOT EXISTS "conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" varchar(255) NOT NULL,
  "task_id" varchar(255) NOT NULL,
  "status" varchar(50) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "error" text,
  CONSTRAINT "conversations_session_id_unique" UNIQUE("session_id")
);

-- 2. 创建 conversation_contexts 表
CREATE TABLE IF NOT EXISTS "conversation_contexts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "work_dir" text NOT NULL,
  "git_branch" varchar(255),
  "relevant_files" jsonb,
  "task_description" text NOT NULL,
  "current_branch_id" uuid NOT NULL,
  "variables" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 3. 创建 branches 表
CREATE TABLE IF NOT EXISTS "branches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "name" varchar(255) NOT NULL,
  "parent_message_id" uuid,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 4. 创建 messages 表
CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "role" varchar(50) NOT NULL,
  "content" text NOT NULL,
  "is_complete" boolean DEFAULT true NOT NULL,
  "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
  "parent_message_id" uuid
);

-- 5. 创建 message_metadata 表
CREATE TABLE IF NOT EXISTS "message_metadata" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "message_id" uuid NOT NULL,
  "tool_calls" jsonb,
  "code_changes" jsonb,
  "thinking" text,
  "is_question" boolean DEFAULT false,
  "question_options" jsonb,
  "requires_response" boolean DEFAULT false,
  "references" jsonb,
  "is_invalid" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 6. 创建索引
-- conversations 表索引
CREATE INDEX IF NOT EXISTS "idx_conversations_session_id" ON "conversations" USING btree ("session_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_task_id" ON "conversations" USING btree ("task_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_status" ON "conversations" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_conversations_created_at" ON "conversations" USING btree ("created_at");

-- conversation_contexts 表索引
CREATE INDEX IF NOT EXISTS "idx_contexts_conversation_id" ON "conversation_contexts" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "unique_contexts_conversation_id" ON "conversation_contexts" USING btree ("conversation_id");

-- branches 表索引
CREATE INDEX IF NOT EXISTS "idx_branches_conversation_id" ON "branches" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_branches_parent_message_id" ON "branches" USING btree ("parent_message_id");
CREATE INDEX IF NOT EXISTS "idx_branches_is_active" ON "branches" USING btree ("is_active");

-- messages 表索引
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_id" ON "messages" USING btree ("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_messages_conversation_timestamp" ON "messages" USING btree ("conversation_id","timestamp");
CREATE INDEX IF NOT EXISTS "idx_messages_branch_id" ON "messages" USING btree ("branch_id");
CREATE INDEX IF NOT EXISTS "idx_messages_timestamp" ON "messages" USING btree ("timestamp");
CREATE INDEX IF NOT EXISTS "idx_messages_parent_message_id" ON "messages" USING btree ("parent_message_id");

-- message_metadata 表索引
CREATE INDEX IF NOT EXISTS "idx_metadata_message_id" ON "message_metadata" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "unique_metadata_message_id" ON "message_metadata" USING btree ("message_id");
CREATE INDEX IF NOT EXISTS "idx_metadata_is_question" ON "message_metadata" USING btree ("is_question");
CREATE INDEX IF NOT EXISTS "idx_metadata_requires_response" ON "message_metadata" USING btree ("requires_response");

-- 完成
SELECT 'Database setup completed successfully!' as status;
