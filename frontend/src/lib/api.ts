/**
 * 后端 API 封装。
 *
 * 所有请求走 vite proxy 的 /api 前缀（开发期转发到 http://127.0.0.1:8000）。
 * 后端 schema 见 backend/app/schemas.py。
 */
import type { KnowledgeBase, KnowledgeBaseFile } from '@/types';

// ---------- 后端返回类型 ----------
export interface KbOut {
  id: number;
  name: string;
  description: string;
  visibility: string;
  provider: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  doc_count: number;
  chunk_count: number;
  status: string;
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
  created_at: string;
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

// ---------- 内部工具：把后端对象映射为前端类型 ----------
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
    // 后端附加信息（详情页可选用）
    docCount: kb.doc_count,
    chunkCount: kb.chunk_count,
    status: kb.status,
    embeddingModel: kb.embedding_model,
  } as KnowledgeBase;
}

function mapDoc(doc: DocumentOut): KnowledgeBaseFile {
  return {
    id: String(doc.id),
    name: doc.filename,
    size: formatBytes(doc.file_size),
    type: doc.file_type,
    uploadedAt: formatDate(doc.created_at),
  };
}

// ---------- fetch 封装 ----------
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
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
  createKb: async (name: string, description: string): Promise<KnowledgeBase> => {
    const data = await request<KbOut>('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, visibility: 'private' }),
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

  /** 删除文档 */
  deleteDocument: async (docId: string | number): Promise<void> => {
    await request<void>(`/api/documents/${docId}`, { method: 'DELETE' });
  },

  /** RAG 问答 */
  chat: async (kbId: string | number, question: string): Promise<ChatResponse> => {
    return request<ChatResponse>(`/api/kb/${kbId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  },
};
