/**
 * 后端 API 封装。
 *
 * 所有请求走 vite proxy 的 /api 前缀（开发期转发到 http://127.0.0.1:8000）。
 * 后端 schema 见 backend/app/schemas.py。
 */
import type { App, DocumentChunk, KbCreatePayload, KnowledgeBase, KnowledgeBaseFile, Plugin, User } from '@/types';

// ---------- 后端返回类型 ----------
export interface KbOut {
  id: number;
  name: string;
  description: string;
  visibility: string;
  provider: string;
  embedding_model: string;
  chunk_method: string;
  chunk_size: number;
  chunk_overlap: number;
  doc_count: number;
  chunk_count: number;
  status: string;
  owner_id: number;
  owner_username: string | null;
  created_at: string;
}

export interface DocumentOut {
  id: number;
  kb_id: number;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  enabled: boolean;
  created_at: string;
}

export interface ChunkOut {
  id: number;
  doc_id: number;
  kb_id: number;
  content: string;
  token_count: number;
  parent_chunk_id: number | null;
  parent_content: string | null;
  created_at: string;
}

export interface ReindexBatchItemResult {
  doc_id: number;
  status: 'ready' | 'error';
  error: string | null;
}

export interface ReindexBatchResponse {
  results: ReindexBatchItemResult[];
}

export interface ProviderInfo {
  name: string;
  label: string;
  available: boolean;
  configured: boolean;
  is_current: boolean;
}

export interface ChatSource {
  document: string;
  content: string;
  score: number;
}

export interface ChatResponse {
  answer: string;
  sources: ChatSource[];
}

export interface TokenOut {
  access_token: string;
  token_type: string;
}

export interface UserOut {
  id: number;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: string;
}

export interface ResetPasswordOut {
  new_password: string;
}

// ---------- Plugin ----------
export interface PluginOut {
  id: number;
  name: string;
  label: string;
  category: string;
  source: 'builtin' | 'uploaded';
  module_path: string;
  installed: boolean;
  is_active: boolean;
  is_embedding_active: boolean;
  base_url: string;
  api_key_set: boolean;
  embedding_model: string;
  extra_json: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillOut {
  id: number;
  name: string;
  description: string;
  content: string;
  filename: string;
  owner_id: number;
  owner_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppOut {
  id: number;
  name: string;
  icon: string;
  description: string;
  type: string;
  category: string;
  status: string;
  config_json: string;
  owner_id: number;
  owner_username: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatAppResponse {
  answer: string;
}

export interface PluginInstallResponse {
  name: string;
  installed: boolean;
  error: string | null;
}

export interface PluginModelsResponse {
  models: string[];
}

// ---------- Token 管理 ----------
const TOKEN_KEY = 'volcano_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---------- 内部工具 ----------
function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.ceil(n / 1024)} KB`;
  return `${n} B`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('zh-CN');
  } catch {
    return iso;
  }
}

function mapKb(kb: KbOut): KnowledgeBase {
  return {
    id: String(kb.id),
    name: kb.name,
    description: kb.description,
    createdAt: formatDate(kb.created_at),
    updatedAt: formatDate(kb.created_at),
    files: [],
    docCount: kb.doc_count,
    chunkCount: kb.chunk_count,
    status: kb.status,
    embeddingModel: kb.embedding_model,
    chunkMethod: (kb.chunk_method || 'general_auto') as KnowledgeBase['chunkMethod'],
    chunkSize: kb.chunk_size,
    chunkOverlap: kb.chunk_overlap,
    ownerId: kb.owner_id,
    ownerUsername: kb.owner_username ?? undefined,
  } as KnowledgeBase;
}

function mapDoc(doc: DocumentOut): KnowledgeBaseFile {
  return {
    id: String(doc.id),
    name: doc.filename,
    size: formatBytes(doc.file_size),
    type: doc.file_type,
    uploadedAt: formatDate(doc.created_at),
    status: doc.status,
    chunkCount: doc.chunk_count,
    enabled: doc.enabled ?? true,
  };
}

function mapUser(u: UserOut): User {
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    status: u.status,
    createdAt: formatDate(u.created_at),
  };
}

function mapPlugin(p: PluginOut): Plugin {
  return {
    id: p.id,
    name: p.name,
    label: p.label,
    category: p.category || 'model',
    source: p.source,
    modulePath: p.module_path,
    installed: p.installed,
    isActive: p.is_active,
    isEmbeddingActive: !!p.is_embedding_active,
    baseUrl: p.base_url,
    apiKeySet: p.api_key_set,
    embeddingModel: p.embedding_model,
    extraJson: p.extra_json || null,
    error: p.error,
    createdAt: formatDate(p.created_at),
    updatedAt: formatDate(p.updated_at),
  };
}

function mapApp(a: AppOut): App {
  return {
    id: a.id,
    name: a.name,
    icon: a.icon,
    description: a.description,
    type: a.type,
    category: a.category,
    status: a.status as 'draft' | 'published',
    configJson: a.config_json,
    ownerId: a.owner_id,
    ownerUsername: a.owner_username ?? undefined,
    createdAt: formatDate(a.created_at),
    updatedAt: formatDate(a.updated_at),
  };
}

// ---------- fetch 封装（自动注入 token） ----------
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const headers = new Headers(init?.headers ?? {});

  // 自动注入 Authorization
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...init, headers });

  // 401 → 清 token + 跳登录
  if (res.status === 401) {
    removeToken();
    // 避免在 /login 页面本身反复跳转
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/login';
    }
    throw new Error('认证已过期，请重新登录');
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(detail);
  }
  // 204 No Content
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

// ---------- 对外 API ----------
export const api = {
  /** 健康检查 */
  health: () => request<{ status: string }>('/api/health'),

  /** 获取 provider 列表 */
  listProviders: () => request<ProviderInfo[]>('/api/providers'),

  /** 知识库列表 */
  listKbs: async (): Promise<KnowledgeBase[]> => {
    const data = await request<KbOut[]>('/api/kb');
    return data.map(mapKb);
  },

  /** 创建知识库 */
  createKb: async (payload: KbCreatePayload): Promise<KnowledgeBase> => {
    const body: Record<string, unknown> = {
      name: payload.name,
      description: payload.description,
      visibility: 'private',
    };
    if (payload.chunkMethod) body.chunk_method = payload.chunkMethod;
    if (payload.chunkSize !== undefined) body.chunk_size = payload.chunkSize;
    if (payload.chunkOverlap !== undefined) body.chunk_overlap = payload.chunkOverlap;
    if (payload.separators?.length) body.separators = payload.separators;
    if (payload.parentChunkSize !== undefined) body.parent_chunk_size = payload.parentChunkSize;

    const data = await request<KbOut>('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return mapKb(data);
  },

  /** 删除知识库 */
  deleteKb: async (id: string | number): Promise<void> => {
    await request<void>(`/api/kb/${id}`, { method: 'DELETE' });
  },

  /** 获取知识库下的文档列表 */
  listDocuments: async (kbId: string | number): Promise<KnowledgeBaseFile[]> => {
    const data = await request<DocumentOut[]>(`/api/kb/${kbId}/documents`);
    return data.map(mapDoc);
  },

  /** 上传文档（multipart） */
  uploadDocuments: async (
    kbId: string | number,
    files: File[],
  ): Promise<KnowledgeBaseFile[]> => {
    const form = new FormData();
    files.forEach((f) => form.append('files', f));
    const data = await request<DocumentOut[]>(`/api/kb/${kbId}/documents`, {
      method: 'POST',
      body: form,
    });
    return data.map(mapDoc);
  },

  /** 上传文本内容（粘贴 Markdown / 纯文本） */
  uploadTextDocument: async (
    kbId: string | number,
    payload: { title: string; content: string; file_type?: 'md' | 'txt' },
  ): Promise<KnowledgeBaseFile> => {
    const data = await request<DocumentOut>(`/api/kb/${kbId}/documents/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: payload.title,
        content: payload.content,
        file_type: payload.file_type ?? 'md',
      }),
    });
    return mapDoc(data);
  },

  /** 删除文档 */
  deleteDocument: async (docId: string | number): Promise<void> => {
    await request<void>(`/api/documents/${docId}`, { method: 'DELETE' });
  },

  /** 单个文档重新分片 */
  reindexDocument: async (docId: string | number): Promise<KnowledgeBaseFile> => {
    const data = await request<DocumentOut>(`/api/documents/${docId}/reindex`, {
      method: 'POST',
    });
    return mapDoc(data);
  },

  /** 批量重新分片 */
  reindexDocumentsBatch: async (
    kbId: string | number,
    docIds: (string | number)[],
  ): Promise<ReindexBatchResponse> => {
    return request<ReindexBatchResponse>(
      `/api/kb/${kbId}/documents/reindex-batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc_ids: docIds.map((id) => Number(id)) }),
      },
    );
  },

  /** 切换单个文档的启用状态（toggle） */
  toggleDocumentEnabled: async (
    docId: string | number,
  ): Promise<KnowledgeBaseFile> => {
    const data = await request<DocumentOut>(
      `/api/documents/${docId}/toggle-enabled`,
      { method: 'POST' },
    );
    return mapDoc(data);
  },

  /** 批量将一批文档统一设为启用 / 禁用 */
  toggleDocumentsEnabledBatch: async (
    kbId: string | number,
    docIds: (string | number)[],
    enabled: boolean,
  ): Promise<KnowledgeBaseFile[]> => {
    const data = await request<DocumentOut[]>(
      `/api/kb/${kbId}/documents/toggle-enabled`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_ids: docIds.map((id) => Number(id)),
          enabled,
        }),
      },
    );
    return data.map(mapDoc);
  },

  /** 获取文档分片列表 */
  fetchDocumentChunks: async (docId: string | number): Promise<DocumentChunk[]> => {
    const data = await request<ChunkOut[]>(`/api/documents/${docId}/chunks`);
    return data.map((c) => ({
      id: c.id,
      docId: c.doc_id,
      kbId: c.kb_id,
      content: c.content,
      tokenCount: c.token_count,
      parentChunkId: c.parent_chunk_id,
      parentContent: c.parent_content,
      createdAt: formatDate(c.created_at),
    }));
  },

  /** RAG 问答 */
  chat: async (kbId: string | number, question: string): Promise<ChatResponse> => {
    return request<ChatResponse>(`/api/kb/${kbId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  },

  // ========== Auth ==========
  /** 登录 */
  login: async (username: string, password: string): Promise<TokenOut> => {
    return request<TokenOut>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
  },

  /** 获取当前用户 */
  getMe: async (): Promise<User> => {
    const data = await request<UserOut>('/api/me');
    return mapUser(data);
  },

  /** 修改自己的密码 */
  changePassword: async (oldPassword: string, newPassword: string): Promise<void> => {
    await request<void>('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
    });
  },

  // ========== 用户管理（管理员） ==========
  /** 用户列表 */
  listUsers: async (): Promise<User[]> => {
    const data = await request<UserOut[]>('/api/users');
    return data.map(mapUser);
  },

  /** 新增用户 */
  createUser: async (username: string, password: string, role: string): Promise<User> => {
    const data = await request<UserOut>('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role }),
    });
    return mapUser(data);
  },

  /** 编辑用户（角色/状态） */
  updateUser: async (userId: number, data: { role?: string; status?: string }): Promise<User> => {
    const result = await request<UserOut>(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return mapUser(result);
  },

  /** 删除用户 */
  deleteUser: async (userId: number): Promise<void> => {
    await request<void>(`/api/users/${userId}`, { method: 'DELETE' });
  },

  /** 重置用户密码 → 返回随机临时密码 */
  resetUserPassword: async (userId: number): Promise<string> => {
    const data = await request<ResetPasswordOut>(`/api/users/${userId}/reset-password`, {
      method: 'POST',
    });
    return data.new_password;
  },

  /** 切换用户启用/禁用状态 */
  toggleUserStatus: async (userId: number): Promise<User> => {
    const data = await request<UserOut>(`/api/users/${userId}/toggle-status`, {
      method: 'POST',
    });
    return mapUser(data);
  },

  // ========== 插件管理（管理员） ==========
  /** 列出所有插件 */
  listPlugins: async (): Promise<Plugin[]> => {
    const data = await request<PluginOut[]>('/api/plugins');
    return data.map(mapPlugin);
  },

  /** 上传 zip 安装插件 */
  uploadPlugin: async (file: File): Promise<PluginInstallResponse> => {
    const form = new FormData();
    form.append('file', file);
    return request<PluginInstallResponse>('/api/plugins/upload', {
      method: 'POST',
      body: form,
    });
  },

  /** 通过 URL 导入插件（后端拉取 zip） */
  importPlugin: async (url: string): Promise<PluginInstallResponse> => {
    return request<PluginInstallResponse>('/api/plugins/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
  },

  /** 修改插件配置（base_url / api_key / model 等） */
  updatePlugin: async (
    name: string,
    data: {
      label?: string;
      category?: string;
      base_url?: string;
      api_key?: string;
      embedding_model?: string;
      is_active?: boolean;
      is_embedding_active?: boolean;
      extra_json?: string;
    },
  ): Promise<Plugin> => {
    const result = await request<PluginOut>(`/api/plugins/${name}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return mapPlugin(result);
  },

  /**
   * 拉取插件的可用模型列表。
   * 表单值优先：传入当前编辑中的 base_url / api_key，留空后端回退到已保存配置。
   * 用于配置弹窗的「拉取模型列表」按钮。
   */
  fetchPluginModels: async (
    name: string,
    data: { base_url?: string; api_key?: string },
  ): Promise<string[]> => {
    const result = await request<PluginModelsResponse>(`/api/plugins/${name}/models`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return result.models;
  },

  /** 标记安装 */
  installPlugin: async (name: string): Promise<Plugin> => {
    const result = await request<PluginOut>(`/api/plugins/${name}/install`, {
      method: 'POST',
    });
    return mapPlugin(result);
  },

  /** 激活为当前生效的 provider */
  activatePlugin: async (name: string): Promise<Plugin> => {
    const result = await request<PluginOut>(`/api/plugins/${name}/activate`, {
      method: 'POST',
    });
    return mapPlugin(result);
  },

  /** 设为当前生效的 Embedding provider（与 LLM 激活独立） */
  activatePluginEmbedding: async (name: string): Promise<Plugin> => {
    const result = await request<PluginOut>(
      `/api/plugins/${name}/activate-embedding`,
      { method: 'POST' },
    );
    return mapPlugin(result);
  },

  /** 卸载插件（builtin 仅 reset，uploaded 彻底删除） */
  deletePlugin: async (name: string): Promise<void> => {
    await request<void>(`/api/plugins/${name}`, { method: 'DELETE' });
  },

  // ========== 技能管理 ==========
  /** 技能列表 */
  listSkills: async (): Promise<SkillOut[]> => {
    return request<SkillOut[]>('/api/skills');
  },

  /** 粘贴 Markdown 内容创建技能 */
  createSkill: async (name: string, content: string, description?: string): Promise<SkillOut> => {
    return request<SkillOut>('/api/skills', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, description: description ?? '' }),
    });
  },

  /** 上传 .md 文件创建技能 */
  uploadSkillFile: async (file: File): Promise<SkillOut> => {
    const form = new FormData();
    form.append('file', file);
    return request<SkillOut>('/api/skills/upload', {
      method: 'POST',
      body: form,
    });
  },

  /** 更新技能 */
  updateSkill: async (id: number, data: { name?: string; content?: string }): Promise<SkillOut> => {
    return request<SkillOut>(`/api/skills/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /** 删除技能 */
  deleteSkill: async (id: number): Promise<void> => {
    await request<void>(`/api/skills/${id}`, { method: 'DELETE' });
  },

  // ========== 应用管理 (Studio) ==========
  listApps: async (all?: boolean): Promise<App[]> => {
    const url = all ? '/api/apps?all=true' : '/api/apps';
    const data = await request<AppOut[]>(url);
    return data.map(mapApp);
  },

  createApp: async (payload: { name: string; icon?: string; description?: string }): Promise<App> => {
    const data = await request<AppOut>('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return mapApp(data);
  },

  getApp: async (id: number): Promise<App> => {
    const data = await request<AppOut>(`/api/apps/${id}`);
    return mapApp(data);
  },

  updateApp: async (id: number, data: { name?: string; icon?: string; description?: string; config_json?: string }): Promise<App> => {
    const result = await request<AppOut>(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return mapApp(result);
  },

  deleteApp: async (id: number): Promise<void> => {
    await request<void>(`/api/apps/${id}`, { method: 'DELETE' });
  },

  toggleAppStatus: async (id: number): Promise<App> => {
    const result = await request<AppOut>(`/api/apps/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    return mapApp(result);
  },

  chatWithApp: async (appId: number, question: string): Promise<ChatAppResponse> => {
    return request<ChatAppResponse>(`/api/apps/${appId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  },

  /** 获取已安装已激活 provider 的模型列表 */
  fetchActiveModels: async (): Promise<{ provider_name: string; label: string; models: { name: string; context: number }[] }[]> => {
    return request<{ provider_name: string; label: string; models: { name: string; context: number }[] }[]>('/api/plugins/active-models');
  },
};
