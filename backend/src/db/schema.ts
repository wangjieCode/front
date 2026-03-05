import {
  pgTable, uuid, varchar, text, boolean,
  timestamp, jsonb, index, uniqueIndex, integer,
} from 'drizzle-orm/pg-core';
import { customType } from 'drizzle-orm/pg-core';

// D2: bytea 自定义类型，直接存 gzip 二进制，不走 base64 中转
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea'; },
});

/**
 * users 表
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
  () => ({})
);

/**
 * conversations 表
 * D4: 移除 summary（冗余，内容与 conversation_contexts.task_description 重复）
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').notNull(),
    projectId: uuid('project_id'),
    status: varchar('status', { length: 50 }).notNull().default('active'),
    visibility: varchar('visibility', { length: 50 }).notNull().default('private'),
    title: varchar('title', { length: 500 }),
    projectName: varchar('project_name', { length: 255 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => ({
    userIdIdx: index('idx_conversations_user_id').on(table.userId),
    projectIdIdx: index('idx_conversations_project_id').on(table.projectId),
    createdAtIdx: index('idx_conversations_created_at').on(table.createdAt),
    userVisibilityCreatedAtIdx: index('idx_conversations_user_visibility_created_at').on(table.userId, table.visibility, table.createdAt),
    visibilityCreatedAtIdx: index('idx_conversations_visibility_created_at').on(table.visibility, table.createdAt),
  })
);

/**
 * conversation_contexts 表
 */
export const conversationContexts = pgTable(
  'conversation_contexts',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    workDir: text('work_dir').notNull(),
    worktreePath: text('worktree_path'),
    gitBranch: varchar('git_branch', { length: 255 }),
    relevantFiles: jsonb('relevant_files'),
    taskDescription: text('task_description').notNull(),
    variables: jsonb('variables').default({}),
    mode: varchar('mode', { length: 50 }).notNull().default('edit'),
    contextGitBranch: varchar('context_git_branch', { length: 255 }),
    mrUrl: text('mr_url'),
    previewInfo: jsonb('preview_info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdUnique: uniqueIndex('unique_contexts_conversation_id').on(table.conversationId),
  })
);

/**
 * messages 表
 * D1: 合并原 message_metadata 字段，消除 1:1 JOIN
 * D5: 移除 is_complete（始终为 true）
 * D9: 增加 (conversation_id, role) 复合索引
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    role: varchar('role', { length: 50 }).notNull(),
    content: text('content').notNull(),
    timestamp: timestamp('timestamp', { withTimezone: true }).notNull().defaultNow(),
    parentMessageId: uuid('parent_message_id'),
    // D1: 从 message_metadata 合并过来的字段
    toolCalls: jsonb('tool_calls'),
    codeChanges: jsonb('code_changes'),
    thinking: text('thinking'),
    isQuestion: boolean('is_question').notNull().default(false),
    questionOptions: jsonb('question_options'),
    requiresResponse: boolean('requires_response').notNull().default(false),
    messageReferences: jsonb('message_references'),
    isInvalid: boolean('is_invalid').notNull().default(false),
    gitBranch: varchar('git_branch', { length: 255 }),
    mrUrl: text('mr_url'),
    images: jsonb('images'),
    operationDenied: jsonb('operation_denied'),
  },
  (table) => ({
    conversationTimestampIdx: index('idx_messages_conversation_timestamp').on(table.conversationId, table.timestamp),
    parentMessageIdIdx: index('idx_messages_parent_message_id').on(table.parentMessageId),
    conversationRoleIdx: index('idx_messages_conversation_role').on(table.conversationId, table.role),
  })
);

/**
 * neovate_sessions 表
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
    conversationIdUnique: uniqueIndex('unique_neovate_sessions_conversation_id').on(table.conversationId),
    neovateSessionIdIdx: index('idx_neovate_sessions_neovate_session_id').on(table.neovateSessionId),
  })
);

/**
 * review_rounds 表
 */
export const reviewRounds = pgTable(
  'review_rounds',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    sourceMessageId: uuid('source_message_id').notNull(),
    roundNumber: integer('round_number').notNull(),
    status: varchar('status', { length: 32 }).notNull().default('completed'),
    summary: text('summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationRoundUnique: uniqueIndex('unique_review_rounds_conversation_round').on(table.conversationId, table.roundNumber),
    sourceMessageIdUnique: uniqueIndex('unique_review_rounds_source_message_id').on(table.sourceMessageId),
    conversationCreatedAtIdx: index('idx_review_rounds_conversation_created_at').on(table.conversationId, table.createdAt),
  })
);

/**
 * review_file_changes 表
 * D8: 增加 (conversation_id, file_path) 复合索引
 */
export const reviewFileChanges = pgTable(
  'review_file_changes',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull(),
    reviewRoundId: uuid('review_round_id').notNull(),
    messageId: uuid('message_id'),
    filePath: text('file_path').notNull(),
    changeType: varchar('change_type', { length: 32 }).notNull().default('modified'),
    status: varchar('status', { length: 32 }).notNull().default('modified'),
    oldPath: text('old_path'),
    diffBlobId: uuid('diff_blob_id').notNull(),
    additions: integer('additions').notNull().default(0),
    deletions: integer('deletions').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    reviewRoundIdIdx: index('idx_review_file_changes_review_round_id').on(table.reviewRoundId),
    conversationRoundIdx: index('idx_review_file_changes_conversation_round').on(table.conversationId, table.reviewRoundId),
    messageIdIdx: index('idx_review_file_changes_message_id').on(table.messageId),
    diffBlobIdIdx: index('idx_review_file_changes_diff_blob_id').on(table.diffBlobId),
    conversationFilePathIdx: index('idx_review_file_changes_conversation_file_path').on(table.conversationId, table.filePath),
  })
);

/**
 * review_diff_blobs 表
 * D2: 使用 bytea 代替 base64 text，节省 ~33% 空间
 * D7: 增加 last_accessed_at 索引（供 TTL 清理任务使用）
 */
export const reviewDiffBlobs = pgTable(
  'review_diff_blobs',
  {
    id: uuid('id').primaryKey(),
    diffHash: varchar('diff_hash', { length: 64 }).notNull(),
    diffBlob: bytea('diff_blob').notNull(),
    rawSize: integer('raw_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    diffHashUnique: uniqueIndex('unique_review_diff_blobs_diff_hash').on(table.diffHash),
    lastAccessedAtIdx: index('idx_review_diff_blobs_last_accessed_at').on(table.lastAccessedAt),
  })
);

/**
 * projects 表
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
    createdAtIdx: index('idx_projects_created_at').on(table.createdAt),
    isActiveCreatedAtIdx: index('idx_projects_is_active_created_at').on(table.isActive, table.createdAt),
  })
);

// 导出类型
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationContext = typeof conversationContexts.$inferSelect;
export type NewConversationContext = typeof conversationContexts.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type ReviewRound = typeof reviewRounds.$inferSelect;
export type NewReviewRound = typeof reviewRounds.$inferInsert;

export type ReviewFileChange = typeof reviewFileChanges.$inferSelect;
export type NewReviewFileChange = typeof reviewFileChanges.$inferInsert;

export type ReviewDiffBlob = typeof reviewDiffBlobs.$inferSelect;
export type NewReviewDiffBlob = typeof reviewDiffBlobs.$inferInsert;

export type NeovateSession = typeof neovateSessions.$inferSelect;
export type NewNeovateSession = typeof neovateSessions.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
