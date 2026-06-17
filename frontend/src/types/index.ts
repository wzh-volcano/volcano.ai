export interface Task {
  id: string;
  text: string;
  time: string;
  active?: boolean;
}

export interface TaskGroup {
  title: string;
  tasks: Task[];
}

export interface MessageAction {
  type: 'search' | 'run' | 'write' | 'update';
  label: string;
  code?: string;
  files?: { name: string; type: 'html' | 'js' | 'css' | 'other' }[];
  diffAdd?: number;
  diffDel?: number;
}

export interface Message {
  id: string;
  type: 'action' | 'text';
  content?: string;
  action?: MessageAction;
}

export interface GitChange {
  label: string;
  add?: number;
  del?: number;
}

export interface ProgressItem {
  text: string;
  done: boolean;
}

export interface KnowledgeBaseFile {
  id: string;
  name: string;
  size: string;
  type: string;
  uploadedAt: string;
  /** 后端 documents.status：ready | indexing | error */
  status?: string;
  /** 后端 documents.chunk_count，用于"是否已分片"判断 */
  chunkCount?: number;
  /** 是否参与 RAG 检索；false = 已禁用 */
  enabled?: boolean;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  files: KnowledgeBaseFile[];
  // 后端返回的附加信息（mock 时可选）
  docCount?: number;
  chunkCount?: number;
  status?: string;
  embeddingModel?: string;
  chunkMethod?: ChunkMethod;
  chunkSize?: number;
  chunkOverlap?: number;
  ownerId?: number;
  ownerUsername?: string;
}

/** 文档分段方法 */
export type ChunkMethod =
  | 'general_auto'      // 通用-自动
  | 'general_custom'    // 通用-自定义
  | 'markdown_header'   // Markdown 标题分段
  | 'parent_child';     // 父子分段

/** 创建知识库时的可选切割参数 */
export interface KbCreatePayload {
  name: string;
  description: string;
  chunkMethod?: ChunkMethod;
  chunkSize?: number;
  chunkOverlap?: number;
  separators?: string[];
  parentChunkSize?: number;
}

export interface DocumentChunk {
  id: number;
  docId: number;
  kbId: number;
  content: string;
  tokenCount: number;
  parentChunkId: number | null;
  parentContent: string | null;
  createdAt: string;
}

export interface User {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface Plugin {
  id: number;
  name: string;
  label: string;
  category: string; // model | other
  source: 'builtin' | 'uploaded';
  modulePath: string;
  installed: boolean;
  isActive: boolean;
  isEmbeddingActive: boolean;
  baseUrl: string;
  apiKeySet: boolean;
  embeddingModel: string;
  extraJson: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface App {
  id: number;
  name: string;
  icon: string;
  description: string;
  type: string;
  category: string;
  status: 'draft' | 'published';
  configJson: string;
  apiEnabled?: boolean;
  ownerId: number;
  ownerUsername?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: number;
  app_id: number;
  title: string;
  summary: string | null;
  message_count: number;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  call_count: number;
}

export interface ApiKeyCreated extends ApiKey {
  full_key: string;
}
