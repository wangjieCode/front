-- 添加 users 和 projects 表，扩展 conversations 表支持多用户和多项目

-- 创建 users 表
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(100) NOT NULL,
  "display_name" varchar(200),
  "avatar_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  CONSTRAINT "users_username_unique" UNIQUE("username")
);

-- 创建 users 表索引
CREATE INDEX IF NOT EXISTS "idx_users_username" ON "users" ("username");
CREATE INDEX IF NOT EXISTS "idx_users_created_at" ON "users" ("created_at");
CREATE INDEX IF NOT EXISTS "idx_users_last_login_at" ON "users" ("last_login_at");

-- 创建 projects 表
CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_key" varchar(100) NOT NULL,
  "project_name" varchar(200) NOT NULL,
  "description" text,
  "repo_dir" text NOT NULL,
  "worktree_base_dir" text NOT NULL,
  "git_default_branch" varchar(100) DEFAULT 'main' NOT NULL,
  "docker_host" varchar(255),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  CONSTRAINT "projects_project_key_unique" UNIQUE("project_key")
);

-- 创建 projects 表索引
CREATE INDEX IF NOT EXISTS "idx_projects_project_key" ON "projects" ("project_key");
CREATE INDEX IF NOT EXISTS "idx_projects_is_active" ON "projects" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_projects_created_at" ON "projects" ("created_at");

-- 为 conversations 表添加新字段（允许为空，用于兼容现有数据）
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "user_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "project_id" uuid;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "worktree_path" text;

-- 创建默认系统用户（用于兼容现有对话数据）
INSERT INTO "users" ("id", "username", "display_name", "is_active")
VALUES ('00000000-0000-0000-0000-000000000001', 'system', '系统用户', true)
ON CONFLICT ("username") DO NOTHING;

-- 创建默认项目（从环境变量读取的默认配置）
-- 注意：需要在系统启动时通过 init-projects 脚本创建真实项目
INSERT INTO "projects" (
  "id",
  "project_key",
  "project_name",
  "description",
  "repo_dir",
  "worktree_base_dir",
  "git_default_branch",
  "is_active"
)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'DEFAULT',
  '默认项目',
  '系统默认项目，用于兼容旧数据',
  '/workspace/default',
  '/workspace/default-worktrees',
  'main',
  true
)
ON CONFLICT ("project_key") DO NOTHING;

-- 为现有的 conversations 数据关联默认用户和项目
UPDATE "conversations"
SET 
  "user_id" = '00000000-0000-0000-0000-000000000001',
  "project_id" = '00000000-0000-0000-0000-000000000001'
WHERE "user_id" IS NULL OR "project_id" IS NULL;

-- 创建 conversations 表的新索引
CREATE INDEX IF NOT EXISTS "idx_conversations_user_id" ON "conversations" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_project_id" ON "conversations" ("project_id");
CREATE INDEX IF NOT EXISTS "idx_conversations_user_created_at" ON "conversations" ("user_id", "created_at");

-- 添加注释
COMMENT ON TABLE "users" IS '用户表：存储登录用户的基础信息';
COMMENT ON TABLE "projects" IS '项目表：存储项目配置信息（不含敏感数据）';
COMMENT ON COLUMN "conversations"."user_id" IS '关联的用户 ID';
COMMENT ON COLUMN "conversations"."project_id" IS '关联的项目 ID';
COMMENT ON COLUMN "conversations"."worktree_path" IS 'Git Worktree 工作目录路径';
