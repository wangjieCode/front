// 对话相关的前端类型定义

export interface ParsedContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  toolName?: string;
  toolInput?: any;
  toolDescription?: string;
  toolResult?: any;
  toolCallId?: string;
}

export enum ConversationMode {
  EDIT = 'edit',
  READONLY = 'readonly',
}

export enum OperationType {
  READ_FILE = 'read_file',
  SEARCH_CODE = 'search_code',
  MODIFY_CODE = 'modify_code',
  CREATE_FILE = 'create_file',
  DELETE_FILE = 'delete_file',
  CREATE_BRANCH = 'create_branch',
  CREATE_MR = 'create_mr',
  PREVIEW_PROJECT = 'preview_project',
}

export enum ConversationStatus {
  ACTIVE = 'active',        // 活跃中 - 可以对话、发送消息、预览等
  ARCHIVED = 'archived',    // 已归档 - 只读，禁用所有编辑功能
}

export enum ConversationVisibility {
  PRIVATE = 'private',      // 私密 - 仅创建者可见
  PUBLIC = 'public',        // 公开 - 所有登录用户可见
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export interface ToolCall {
  toolName: string;
  parameters: Record<string, any>;
  result?: any;
  timestamp: string;
}

export interface CodeChange {
  filePath: string;
  changeType: 'added' | 'modified' | 'deleted';
  diff: string;
}

export interface MessageMetadata {
  toolCalls?: ToolCall[];
  codeChanges?: CodeChange[];
  thinking?: string;
  isQuestion?: boolean;
  questionOptions?: string[];
  requiresResponse?: boolean;
  references?: string[];
  isInvalid?: boolean;
  gitBranch?: string;
  mrUrl?: string;
  images?: ImageAttachment[];
  operationDenied?: {
    operation: OperationType;
    reason: string;
  };
}

export interface ImageAttachment {
  data: string;
  mimeType: string;
  name?: string;
}

export interface ParsedContent {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  toolName?: string;
  toolInput?: any;
  toolDescription?: string;
  toolResult?: any;
  toolCallId?: string;
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  branchId?: string;
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata;
  timestamp: string;
  parentMessageId?: string;
  isStreaming?: boolean;
  parsedContents?: ParsedContent[];
}

export interface ProjectInfo {
  projectId: string;
  projectName: string;
  gitRepositoryUrl: string;
  workDir: string;
  gitBranch?: string;
  relevantFiles?: string[];
}

export interface ConversationContext {
  projectInfo: ProjectInfo;
  taskDescription: string;
  messageHistory: string[];
  variables: Record<string, any>;
  mode: ConversationMode;
  gitBranch?: string;
  mrUrl?: string;
  previewInfo?: PreviewInfo;
}

export interface SimplifiedConversation {
  id: string;
  projectInfo: ProjectInfo;
  mode: ConversationMode;
  overview: string;
  status: ConversationStatus;
  visibility: ConversationVisibility;
  createdAt: string;
  updatedAt: string;
  title?: string;
}

export interface ConversationSession {
  id: string;
  userId: string;
  status: ConversationStatus;
  visibility: ConversationVisibility;
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  title?: string;
}

export interface PendingQuestion {
  question: string;
  options?: string[];
}

export interface ValidationResult {
  allowed: boolean;
  reason?: string;
}

export interface MergeRequestInfo {
  mrId: number;
  webUrl: string;
  sourceBranch: string;
  targetBranch: string;
  title: string;
}

// ==================== 预览相关类型定义 ====================

export enum PreviewStatus {
  BUILDING = 'building',
  RUNNING = 'running',
  STOPPED = 'stopped',
  ERROR = 'error',
}

export interface PortMapping {
  host: number;
  container: number;
  service: string;
}

export interface PreviewInfo {
  url: string;
  containerId: string;
  imageId?: string;
  imageName?: string;
  branchName: string;
  deployedAt: string;
  status: PreviewStatus;
  ports?: PortMapping[];
  isRunning?: boolean;
  accessUrl?: string;
}

export interface DeploymentInfo {
  buildTime: number;
  startTime: number;
  totalTime: number;
  ports: PortMapping[];
}

export interface PreviewResult {
  success: boolean;
  previewUrl?: string;
  containerId?: string;
  deploymentInfo?: DeploymentInfo;
  error?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  lastCheck: string;
  details?: string;
}

export interface PreviewStatusResponse {
  status: PreviewStatus;
  url?: string;
  containerId?: string;
  branchName?: string;
  deployedAt?: string;
  healthCheck?: HealthCheckResult;
}
