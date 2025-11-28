// 对话相关的前端类型定义

export enum ConversationStatus {
  PLANNING = 'planning',
  EXECUTING = 'executing',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
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
}

export interface ConversationMessage {
  id: string;
  sessionId: string;
  branchId: string;
  role: MessageRole;
  content: string;
  metadata?: MessageMetadata;
  timestamp: string;
  parentMessageId?: string;
}

export interface ProjectInfo {
  workDir: string;
  gitBranch?: string;
  relevantFiles?: string[];
}

export interface ConversationBranch {
  id: string;
  name: string;
  parentMessageId: string;
  messageIds: string[];
  createdAt: string;
  isActive: boolean;
}

export interface ConversationContext {
  projectInfo: ProjectInfo;
  taskDescription: string;
  messageHistory: string[];
  currentBranchId: string;
  branches: ConversationBranch[];
  variables: Record<string, any>;
}

export interface ConversationSession {
  id: string;
  taskId: string;
  status: ConversationStatus;
  context: ConversationContext;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
}

export interface PendingQuestion {
  question: string;
  options?: string[];
}
