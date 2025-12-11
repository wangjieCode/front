import { pgTable, uuid, varchar, text, boolean, timestamp, jsonb, index, integer, unique } from 'drizzle-orm/pg-core';

/**
 * conversations 表
 * 存储对话会话的基本信息
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: varchar('session_id', { length: 255 }).notNull().unique(),
    taskId: varchar('task_id', { length: 255 }).notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    userId: uuid('user_id'), // 所属用户 ID
    projectId: uuid('project_id'), // 所属项目 ID
    workspaceId: uuid('workspace_id'), // 使用的工作空间 ID
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => ({
    sessionIdIdx: index('idx_conversations_session_id').on(table.sessionId),
    taskIdIdx: index('idx_conversations_task_id').on(table.taskId),
    statusIdx: index('idx_conversations_status').on(table.status),
    createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
    userIdIdx: index('idx_conversations_user_id').on(table.userId),
    projectIdIdx: index('idx_conversations_project_id').on(table.projectId),
    workspaceIdIdx: index('idx_conversations_workspace_id').on(table.workspaceId),
  })
);

/**
 * conversation_contexts 表
 * 存储对话的上下文信息
 */
export const conversationContexts = pgTable(
  'conversation_contexts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    workDir: text('work_dir').notNull(),
    gitBranch: varchar('git_branch', { length: 255 }),
    relevantFiles: jsonb('relevant_files'),
    taskDescription: text('task_description').notNull(),
    currentBranchId: uuid('current_branch_id').notNull(),
    variables: jsonb('variables').default({}),
    mode: varchar('mode', { length: 50 }).notNull().default('edit'), // 对话模式
    contextGitBranch: varchar('context_git_branch', { length: 255 }), // 编辑模式下创建的 Git 分支
    mrUrl: text('mr_url'), // 编辑模式下创建的 MR URL
    previewInfo: jsonb('preview_info'), // 预览部署信息（包含镇像 ID、容器 ID、运行状态等）
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
 * branches 表
 * 存储对话分支信息
 */
export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    parentMessageId: uuid('parent_message_id'),
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index('idx_branches_conversation_id').on(table.conversationId),
    parentMessageIdIdx: index('idx_branches_parent_message_id').on(table.parentMessageId),
    isActiveIdx: index('idx_branches_is_active').on(table.isActive),
  })
);

/**
 * messages 表
 * 存储对话消息
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    content: text('content').notNull(),
    isComplete: boolean('is_complete').notNull().default(true),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    parentMessageId: uuid('parent_message_id'),
  },
  (table) => ({
    conversationIdIdx: index('idx_messages_conversation_id').on(table.conversationId),
    branchIdIdx: index('idx_messages_branch_id').on(table.branchId),
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
    id: uuid('id').primaryKey().defaultRandom(),
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
    id: uuid('id').primaryKey().defaultRandom(),
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

export type Branch = typeof branches.$inferSelect;
export type NewBranch = typeof branches.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type MessageMetadata = typeof messageMetadata.$inferSelect;
export type NewMessageMetadata = typeof messageMetadata.$inferInsert;

export type NeovateSession = typeof neovateSessions.$inferSelect;
export type NewNeovateSession = typeof neovateSessions.$inferInsert;

/**
 * users 表
 * 存储用户基本信息
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    email: varchar('email', { length: 100 }).unique(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, inactive
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => ({
    usernameIdx: index('idx_users_username').on(table.username),
    emailIdx: index('idx_users_email').on(table.email),
    statusIdx: index('idx_users_status').on(table.status),
  })
);

/**
 * projects 表
 * 存储项目配置信息
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 100 }).notNull().unique(),
    description: text('description'),
    gitlabUrl: varchar('gitlab_url', { length: 255 }).notNull(),
    gitlabToken: varchar('gitlab_token', { length: 255 }).notNull(),
    gitlabProjectId: varchar('gitlab_project_id', { length: 100 }).notNull(),
    baseWorkDir: varchar('base_work_dir', { length: 500 }).notNull(),
    defaultBranch: varchar('default_branch', { length: 100 }).notNull().default('main'),
    sshConfig: jsonb('ssh_config'),
    dockerComposeConfig: jsonb('docker_compose_config'),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, archived
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameIdx: index('idx_projects_name').on(table.name),
    statusIdx: index('idx_projects_status').on(table.status),
    createdByIdx: index('idx_projects_created_by').on(table.createdBy),
  })
);

/**
 * user_projects 表
 * 存储用户与项目的关联关系
 */
export const userProjects = pgTable(
  'user_projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    projectId: uuid('project_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_user_projects_user_id').on(table.userId),
    projectIdIdx: index('idx_user_projects_project_id').on(table.projectId),
    uniqueUserProject: unique('unique_user_project').on(table.userId, table.projectId),
  })
);

/**
 * user_workspaces 表
 * 存储用户工作空间（Git worktree）信息
 */
export const userWorkspaces = pgTable(
  'user_workspaces',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    projectId: uuid('project_id').notNull(),
    worktreePath: varchar('worktree_path', { length: 500 }).notNull(),
    worktreeBranch: varchar('worktree_branch', { length: 100 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('active'), // active, cleanup
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index('idx_user_workspaces_user_id').on(table.userId),
    projectIdIdx: index('idx_user_workspaces_project_id').on(table.projectId),
    statusIdx: index('idx_user_workspaces_status').on(table.status),
    uniqueUserProjectWorkspace: unique('unique_user_project_workspace').on(table.userId, table.projectId),
  })
);

/**
 * container_quota 表
 * 存储容器资源配额信息
 */
export const containerQuota = pgTable(
  'container_quota',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quotaType: varchar('quota_type', { length: 50 }).notNull(), // global, user, project
    maxContainers: integer('max_containers').notNull(),
    currentContainers: integer('current_containers').notNull().default(0),
    referenceId: uuid('reference_id'), // 用户ID或项目ID，global时为null
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    quotaTypeIdx: index('idx_container_quota_type').on(table.quotaType),
    uniqueQuotaTypeRef: unique('unique_quota_type_ref').on(table.quotaType, table.referenceId),
  })
);

// 导出新表的类型
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type UserProject = typeof userProjects.$inferSelect;
export type NewUserProject = typeof userProjects.$inferInsert;

export type UserWorkspace = typeof userWorkspaces.$inferSelect;
export type NewUserWorkspace = typeof userWorkspaces.$inferInsert;

export type ContainerQuota = typeof containerQuota.$inferSelect;
export type NewContainerQuota = typeof containerQuota.$inferInsert;
