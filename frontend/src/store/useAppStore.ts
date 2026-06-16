import { create } from 'zustand';
import type { TaskGroup, Message, ProgressItem, GitChange, KnowledgeBase, KnowledgeBaseFile, KbCreatePayload } from '@/types';
import { api, type ReindexBatchResponse } from '@/lib/api';

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  rightbarOpen: boolean;
  toggleRightbar: () => void;
  taskGroups: TaskGroup[];
  messages: Message[];
  progressItems: ProgressItem[];
  gitChanges: GitChange[];
  branch: string;
  goalTitle: string;
  goalMeta: string;
  goalStatus: string;
  knowledgeBases: KnowledgeBase[];
  kbLoading: boolean;
  kbError: string | null;
  setActiveTask: (groupIndex: number, taskIndex: number) => void;
  loadKnowledgeBases: () => Promise<void>;
  createKnowledgeBase: (payload: KbCreatePayload) => Promise<void>;
  updateKnowledgeBase: (id: string, data: Partial<Pick<KnowledgeBase, 'name' | 'description'>>) => void;
  deleteKnowledgeBase: (id: string) => Promise<void>;
  loadFiles: (kbId: string) => Promise<void>;
  uploadFiles: (kbId: string, files: File[]) => Promise<void>;
  uploadTextDocument: (kbId: string, payload: { title: string; content: string; file_type?: 'md' | 'txt' }) => Promise<void>;
  removeFileFromKnowledgeBase: (kbId: string, fileId: string) => Promise<void>;
  reindexDocument: (kbId: string, fileId: string) => Promise<void>;
  reindexDocuments: (kbId: string, fileIds: string[]) => Promise<ReindexBatchResponse>;
  toggleDocumentEnabled: (kbId: string, fileId: string) => Promise<void>;
  toggleDocumentsEnabled: (kbId: string, fileIds: string[], enabled: boolean) => Promise<void>;
  // 旧接口保留兼容（本地即时更新，不调后端）
  addFileToKnowledgeBase: (kbId: string, file: KnowledgeBaseFile) => void;
}

const now = () => new Date().toLocaleString('zh-CN');

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  rightbarOpen: false,
  toggleRightbar: () => set((state) => ({ rightbarOpen: !state.rightbarOpen })),
  taskGroups: [
    {
      title: 'gomoku-ai',
      tasks: [
        { id: '1', text: '创建一个智能五子棋游戏...', time: '2m', active: true },
        { id: '2', text: '整理开始提示、回合状态...', time: '9m' },
        { id: '3', text: '接入启发式 AI 落子和玩...', time: '14m' },
        { id: '4', text: '适配移动端棋盘缩放和...', time: '27m' },
        { id: '5', text: '补一版规则说明、重开...', time: '51m' },
      ],
    },
    {
      title: 'zcode-website',
      tasks: [
        { id: '6', text: '修复对话区在 resize 时...', time: '8m' },
        { id: '7', text: '重写 hero visual 的 wor...', time: '3m' },
        { id: '8', text: '整理官网首页英文文案...', time: '42m' },
        { id: '9', text: '调整首页 hero 在 13 寸和...', time: '1h' },
        { id: '10', text: '补一版定价 FAQ 和企...', time: '2h' },
        { id: '11', text: '优化 docs 搜索结果高亮...', time: '5h' },
      ],
    },
    {
      title: 'zcode-desktop',
      tasks: [],
    },
  ],
  messages: [
    {
      id: 'm1',
      type: 'action',
      action: {
        type: 'search',
        label: '已探索',
        code: '1 search, 1 file',
      },
    },
    {
      id: 'm2',
      type: 'text',
      content: '这个仓库看起来是空的，或者几乎没有现成代码。我现在继续确认目录内容，判断是基于已有应用扩展，还是需要从零开始实现。',
    },
    {
      id: 'm3',
      type: 'action',
      action: {
        type: 'run',
        label: '已运行',
        code: 'git status --short',
      },
    },
    {
      id: 'm4',
      type: 'text',
      content: '这里没有现成应用，所以我会从零开始做一个自包含实现。我先确认是否有本地项目约定需要遵守，然后补上浏览器端五子棋、启发式 AI、回合处理，以及明确的五子连线胜负判断。',
    },
    {
      id: 'm5',
      type: 'action',
      action: {
        type: 'write',
        label: '已写入',
        files: [
          { name: 'index.html', type: 'html' },
          { name: 'app.js', type: 'js' },
          { name: 'styles.css', type: 'css' },
        ],
        diffAdd: 733,
      },
    },
    {
      id: 'm6',
      type: 'text',
      content: '完整 UI 和核心逻辑已经就位。我正在验证 JavaScript 是否可以正常解析，并复查落子评分逻辑，覆盖首步响应、平局处理和长连线胜利等边界情况。',
    },
    {
      id: 'm7',
      type: 'action',
      action: {
        type: 'run',
        label: '已运行',
        code: 'node --check app.js',
      },
    },
    {
      id: 'm8',
      type: 'text',
      content: '我发现了一个可以避免的依赖：页面原本拉取了在线字体。我正在去掉它，这样整个游戏可以完全本地运行，直接打开 index.html 就不需要网络。',
    },
    {
      id: 'm9',
      type: 'action',
      action: {
        type: 'update',
        label: '已更新',
        files: [
          { name: 'styles.css', type: 'css' },
          { name: 'index.html', type: 'html' },
        ],
        diffAdd: 1,
        diffDel: 7,
      },
    },
    {
      id: 'm10',
      type: 'text',
      content: '已在 index.html、styles.css 和 app.js 中完成一个独立运行的浏览器五子棋游戏。它会渲染一个 15x15 棋盘，允许玩家放置黑棋，支持四个方向的胜负判断，高亮连成五子的路径，跟踪当前回合和步数，并支持重新开始对局。',
    },
  ],
  progressItems: [
    { text: '初始化棋盘、棋子渲染和 15×15 网格布局', done: true },
    { text: '实现玩家落子交互和胜负判定逻辑', done: true },
    { text: '接入启发式 AI 算法实现电脑自动落子', done: true },
    { text: '适配移动端棋盘缩放和横竖屏布局', done: true },
    { text: '补一版规则说明、重开入口和空状态引导', done: true },
  ],
  gitChanges: [
    { label: 'Changes', add: 734, del: 7 },
    { label: 'feat/gomoku-ai' },
    { label: 'Commit' },
  ],
  branch: 'feat/gomoku-ai',
  goalTitle: '五子棋人机对战 — 使用启发式 AI 算法实现电脑落子',
  goalMeta: '5/5 · 2m · 89K tokens',
  goalStatus: 'Complete',
  knowledgeBases: [
    {
      id: 'kb-1',
      name: '前端开发规范',
      description: 'React、TypeScript、Less、Tailwind 等前端技术栈的编码规范与最佳实践。',
      createdAt: '2026/6/10 14:30:00',
      updatedAt: '2026/6/12 09:15:00',
      files: [
        { id: 'f1', name: 'component-guide.md', size: '12 KB', type: 'md', uploadedAt: '2026/6/10' },
        { id: 'f2', name: 'tailwind-config.js', size: '3 KB', type: 'js', uploadedAt: '2026/6/11' },
      ],
    },
    {
      id: 'kb-2',
      name: 'AI 模型 Prompt 模板',
      description: '常用 AI 辅助编程的 Prompt 模板集合，涵盖代码审查、重构、文档生成等场景。',
      createdAt: '2026/6/8 10:00:00',
      updatedAt: '2026/6/14 16:45:00',
      files: [
        { id: 'f3', name: 'code-review-prompts.md', size: '8 KB', type: 'md', uploadedAt: '2026/6/08' },
        { id: 'f4', name: 'refactor-prompts.md', size: '6 KB', type: 'md', uploadedAt: '2026/6/09' },
        { id: 'f5', name: 'doc-gen-prompts.md', size: '5 KB', type: 'md', uploadedAt: '2026/6/14' },
      ],
    },
    {
      id: 'kb-3',
      name: '项目设计文档',
      description: '产品 PRD、技术架构文档、API 接口定义等项目核心文档。',
      createdAt: '2026/6/1 09:00:00',
      updatedAt: '2026/6/5 11:20:00',
      files: [],
    },
  ],
  kbLoading: false,
  kbError: null,
  loadKnowledgeBases: async () => {
    set({ kbLoading: true, kbError: null });
    try {
      const kbs = await api.listKbs();
      set({ knowledgeBases: kbs, kbLoading: false });
    } catch (e) {
      set({
        kbLoading: false,
        kbError: e instanceof Error ? e.message : String(e),
      });
      // 失败时保留本地 mock 数据，UI 仍可用
    }
  },
  setActiveTask: (groupIndex: number, taskIndex: number) => {
    set((state) => {
      const groups = state.taskGroups.map((g, gi) => ({
        ...g,
        tasks: g.tasks.map((t, ti) => ({
          ...t,
          active: gi === groupIndex && ti === taskIndex,
        })),
      }));
      return { taskGroups: groups };
    });
  },
  createKnowledgeBase: async (payload: KbCreatePayload) => {
    try {
      const created = await api.createKb(payload);
      set((state) => ({ knowledgeBases: [created, ...state.knowledgeBases], kbError: null }));
    } catch (e) {
      // 后端不可用时回退到本地
      const newKb: KnowledgeBase = {
        id: `local-${Date.now()}`,
        name: payload.name,
        description: payload.description,
        createdAt: now(),
        updatedAt: now(),
        files: [],
        chunkMethod: payload.chunkMethod ?? 'general_auto',
        chunkSize: payload.chunkSize,
        chunkOverlap: payload.chunkOverlap,
      };
      set((state) => ({
        knowledgeBases: [newKb, ...state.knowledgeBases],
        kbError: e instanceof Error ? e.message : String(e),
      }));
    }
  },
  updateKnowledgeBase: (id: string, data) => {
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === id ? { ...kb, ...data, updatedAt: now() } : kb
      ),
    }));
  },
  deleteKnowledgeBase: async (id: string) => {
    const previous = useAppStore.getState().knowledgeBases;
    // 乐观删除
    set((state) => ({ knowledgeBases: state.knowledgeBases.filter((kb) => kb.id !== id) }));
    try {
      await api.deleteKb(id);
    } catch (e) {
      // 失败回滚
      set({ knowledgeBases: previous, kbError: e instanceof Error ? e.message : String(e) });
    }
  },
  loadFiles: async (kbId: string) => {
    try {
      const files = await api.listDocuments(kbId);
      set((state) => ({
        knowledgeBases: state.knowledgeBases.map((kb) =>
          kb.id === kbId ? { ...kb, files } : kb
        ),
      }));
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
    }
  },
  uploadFiles: async (kbId: string, files: File[]) => {
    try {
      await api.uploadDocuments(kbId, files);
      // 上传后刷新文件列表
      await useAppStore.getState().loadFiles(kbId);
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  uploadTextDocument: async (kbId, payload) => {
    try {
      await api.uploadTextDocument(kbId, payload);
      await useAppStore.getState().loadFiles(kbId);
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  addFileToKnowledgeBase: (kbId: string, file: KnowledgeBaseFile) => {
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === kbId
          ? { ...kb, files: [...kb.files, file], updatedAt: now() }
          : kb
      ),
    }));
  },
  removeFileFromKnowledgeBase: async (kbId: string, fileId: string) => {
    const previous = useAppStore.getState().knowledgeBases;
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === kbId
          ? { ...kb, files: kb.files.filter((f) => f.id !== fileId), updatedAt: now() }
          : kb
      ),
    }));
    try {
      await api.deleteDocument(fileId);
    } catch (e) {
      // 失败回滚
      set({ knowledgeBases: previous, kbError: e instanceof Error ? e.message : String(e) });
    }
  },
  reindexDocument: async (kbId: string, fileId: string) => {
    try {
      await api.reindexDocument(fileId);
      await useAppStore.getState().loadFiles(kbId);
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  reindexDocuments: async (kbId: string, fileIds: string[]) => {
    try {
      const resp = await api.reindexDocumentsBatch(kbId, fileIds);
      await useAppStore.getState().loadFiles(kbId);
      return resp;
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  toggleDocumentEnabled: async (kbId: string, fileId: string) => {
    // 乐观更新：先翻转本地，请求失败再回滚
    const previous = useAppStore.getState().knowledgeBases;
    set((state) => ({
      knowledgeBases: state.knowledgeBases.map((kb) =>
        kb.id === kbId
          ? {
              ...kb,
              files: kb.files.map((f) =>
                f.id === fileId ? { ...f, enabled: !(f.enabled ?? true) } : f,
              ),
            }
          : kb
      ),
    }));
    try {
      await api.toggleDocumentEnabled(fileId);
      await useAppStore.getState().loadFiles(kbId);
    } catch (e) {
      set({ knowledgeBases: previous, kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
  toggleDocumentsEnabled: async (kbId: string, fileIds: string[], enabled: boolean) => {
    try {
      await api.toggleDocumentsEnabledBatch(kbId, fileIds, enabled);
      await useAppStore.getState().loadFiles(kbId);
    } catch (e) {
      set({ kbError: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  },
}));
