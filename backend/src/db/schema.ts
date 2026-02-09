import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

/**
 * users 表
 * 存储用户信息
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    usernameIdx: index('idx_users_username').on(table.username),
  })
);

/**
 * conversations 表
 * 存储对话会话的基本信息
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    projectId: uuid('project_id'),
    status: varchar('status', { length: 50 }).notNull(),
    visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
    title: varchar('title', { length: 500 }),
    summary: text('summary'),
    projectName: varchar('project_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => ({
    userIdIdx: index('idx_conversations_user_id').on(table.userId),
    projectIdIdx: index('idx_conversations_project_id').on(table.projectId),
    statusIdx: index('idx_conversations_status').on(table.status),
    visibilityIdx: index('idx_conversations_visibility').on(table.visibility),
    createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
    titleIdx: index('idx_conversations_title').on(table.title),
  })
);

/**
 * conversation_contexts 表
 * 存储对话的上下文信息
 */
export const conversationContexts = pgTable(
  'conversation_contexts',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    workDir: text('work_dir').notNull(),
    worktreePath: text('worktree_path'), // 对话关联的 worktree 路径
    gitBranch: varchar('git_branch', { length: 255 }),
    relevantFiles: jsonb('relevant_files'),
    taskDescription: text('task_description').notNull(),
    variables: jsonb('variables').default({}),
    mode: varchar('mode', { length: 50 }).notNull().default('edit'), // 对话模式
    contextGitBranch: varchar('context_git_branch', { length: 255 }), // 编辑模式下创建的 Git 分支
    mrUrl: text('mr_url'), // 编辑模式下创建的 MR URL
    previewInfo: jsonb('preview_info'), // 预览部署信息（包含镜像 ID、容器 ID、运行状态等）
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index('idx_contexts_conversation_id').on(table.conversationId),
    conversationIdUnique: index('unique_contexts_conversation_id').on(table.conversationId),
    modeIdx: index('idx_contexts_mode').on(table.mode),
  })
);



/**
 * messages 表
 * 存储对话消息
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    content: text('content').notNull(),
    isComplete: boolean('is_complete').notNull().default(true),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    parentMessageId: uuid('parent_message_id'),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    timestampIdx: index('idx_messages_timestamp').on(table.timestamp),
    parentMessageIdIdx: index('idx_messages_parent_message_id').on(table.parentMessageId),
  })
);

/**
 * neovate_sessions 表
 * 存储 Neovate AI 工具的会话映射
 */
export const neovateSessions = pgTable(
  'neovate_sessions',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    neovateSessionId: varchar('neovate_session_id', { length: 255 }).notNull(),
    workDir: text('work_dir').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index('idx_neovate_sessions_conversation_id').on(table.conversationId),
    conversationIdUnique: index('unique_neovate_sessions_conversation_id').on(table.conversationId),
    neovateSessionIdIdx: index('idx_neovate_sessions_neovate_session_id').on(table.neovateSessionId),
  })
);

/**
 * message_metadata 表
 * 存储消息的元数据（工具调用、代码变更等）
 */
export const messageMetadata = pgTable(
  'message_metadata',
  {
    id: uuid('id').primaryKey(),
    messageId: uuid('message_id').notNull(),
    toolCalls: jsonb('tool_calls'),
    codeChanges: jsonb('code_changes'),
    thinking: text('thinking'),
    isQuestion: boolean('is_question').default(false),
    questionOptions: jsonb('question_options'),
    requiresResponse: boolean('requires_response').default(false),
    messageReferences: jsonb('message_references'),
    isInvalid: boolean('is_invalid').default(false),
    gitBranch: varchar('git_branch', { length: 255 }), // 关联的 Git 分支
    mrUrl: text('mr_url'), // 关联的 MR URL
    operationDenied: jsonb('operation_denied'), // 操作被拒绝的信息
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    messageIdIdx: index('idx_metadata_message_id').on(table.messageId),
    messageIdUnique: index('unique_metadata_message_id').on(table.messageId),
    isQuestionIdx: index('idx_metadata_is_question').on(table.isQuestion),
    requiresResponseIdx: index('idx_metadata_requires_response').on(table.requiresResponse),
  })
);

// 导出类型
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationContext = typeof conversationContexts.$inferSelect;
export type NewConversationContext = typeof conversationContexts.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type MessageMetadata = typeof messageMetadata.$inferSelect;
export type NewMessageMetadata = typeof messageMetadata.$inferInsert;

export type NeovateSession = typeof neovateSessions.$inferSelect;
export type NewNeovateSession = typeof neovateSessions.$inferInsert;

/**
 * projects 表
 * 存储项目信息
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    repoDir: text('repo_dir').notNull(),
    gitBranch: varchar('git_branch', { length: 100 }).notNull().default('main'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    gitRepositoryUrl: varchar('git_repository_url', { length: 500 }).notNull(),
    gitlabProjectId: varchar('gitlab_project_id', { length: 100 }),
    gitlabUrl: varchar('gitlab_url', { length: 500 }),
    workDirectory: varchar('work_directory', { length: 500 }).notNull(),
    ownerId: uuid('owner_id').notNull(),
  },
  (table) => ({
    ownerIdIdx: index('idx_projects_owner_id').on(table.ownerId),
    nameIdx: index('idx_projects_name').on(table.name),
    isActiveIdx: index('idx_projects_is_active').on(table.isActive),
    createdAtIdx: index('idx_projects_created_at').on(table.createdAt),
  })
);

// 移除项目成员表，简化权限控制

// 导出类型
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// 移除项目成员相关类型
