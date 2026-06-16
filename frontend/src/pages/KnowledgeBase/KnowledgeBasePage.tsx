import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { useAuthStore } from '@/store/useAuthStore';
import { KnowledgeBaseForm } from './KnowledgeBaseForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  FileText,
  Pencil,
  Trash2,
  FolderOpen,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { KbCreatePayload, KnowledgeBase } from '@/types';

const PAGE_SIZE = 8;

export const KnowledgeBasePage: React.FC = () => {
  const navigate = useNavigate();
  const knowledgeBases = useAppStore((s) => s.knowledgeBases);
  const kbLoading = useAppStore((s) => s.kbLoading);
  const kbError = useAppStore((s) => s.kbError);
  const loadKnowledgeBases = useAppStore((s) => s.loadKnowledgeBases);
  const createKnowledgeBase = useAppStore((s) => s.createKnowledgeBase);
  const updateKnowledgeBase = useAppStore((s) => s.updateKnowledgeBase);
  const deleteKnowledgeBase = useAppStore((s) => s.deleteKnowledgeBase);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  // 进入页面拉取后端最新列表
  useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingKb, setEditingKb] = useState<KnowledgeBase | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBase | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return knowledgeBases;
    return knowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(q) ||
        kb.description.toLowerCase().includes(q)
    );
  }, [knowledgeBases, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleCreate = async (payload: KbCreatePayload) => {
    setSubmitting(true);
    try {
      await createKnowledgeBase(payload);
      setCurrentPage(1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (payload: KbCreatePayload) => {
    if (editingKb) {
      updateKnowledgeBase(editingKb.id, { name: payload.name, description: payload.description });
      setEditingKb(undefined);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteKnowledgeBase(deleteTarget.id);
      setDeleteTarget(null);
      setCurrentPage(1);
    }
  };

  const openEdit = (kb: KnowledgeBase) => {
    setEditingKb(kb);
    setFormOpen(true);
  };

  const openCreate = () => {
    setEditingKb(undefined);
    setFormOpen(true);
  };

  const goPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <FolderOpen size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">知识库</h2>
          <span className="text-xs text-text-mute ml-2">{filtered.length} 个</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="搜索知识库..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5" disabled={submitting}>
            <Plus size={14} />
            新建知识库
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {kbLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载知识库...</p>
          </div>
        ) : kbError && knowledgeBases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <AlertCircle size={28} className="text-warning" />
            <p className="text-sm">无法连接后端：{kbError}</p>
            <p className="text-2xs text-text-mute">请确认 backend 已启动（默认 http://127.0.0.1:8000）</p>
            <Button variant="ghost" size="sm" onClick={() => loadKnowledgeBases()}>
              重试
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <FolderOpen size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的知识库' : '暂无知识库'}</p>
            {!query && (
              <Button variant="ghost" size="sm" onClick={openCreate}>
                创建第一个知识库
              </Button>
            )}
          </div>
        ) : (
          <>
            {kbError && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-warning/10 text-warning text-xs">
                <AlertCircle size={14} />
                <span>后端同步失败：{kbError}（当前显示本地缓存）</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {paginated.map((kb) => (
                <div
                  key={kb.id}
                  className="group flex flex-col p-4 rounded-xl border border-border bg-bg-2 hover:bg-bg-hover hover:border-border-strong transition-colors duration-150 cursor-pointer"
                  onClick={() => navigate(`/knowledge-base/${kb.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-lg bg-bg-3 border border-border inline-flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-accent" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(kb);
                        }}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-active transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(kb);
                        }}
                        className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-error hover:bg-error/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-text mt-3 truncate">{kb.name}</h3>
                  <p className="text-xs text-text-dim mt-1 line-clamp-2 h-8">{kb.description || '暂无描述'}</p>
                  {isAdmin && kb.ownerUsername && (
                    <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-3 border border-border text-2xs text-text-dim">
                      <span className="text-text-mute">拥有者：</span>
                      <span className="text-text">{kb.ownerUsername}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-2xs text-text-mute">
                    <span>{kb.docCount ?? kb.files.length} 个文件</span>
                    <span>更新于 {kb.updatedAt}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* 分页 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                <button
                  onClick={() => goPage(safePage - 1)}
                  disabled={safePage <= 1}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-md text-xs transition-colors ${
                      p === safePage
                        ? 'bg-accent text-white'
                        : 'text-text-dim hover:text-text hover:bg-bg-hover'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => goPage(safePage + 1)}
                  disabled={safePage >= totalPages}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
                <span className="text-xs text-text-mute ml-2">
                  第 {safePage} / {totalPages} 页
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 创建/编辑弹窗 */}
      <KnowledgeBaseForm
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editingKb}
        onSubmit={editingKb ? handleEdit : handleCreate}
      />

      {/* 删除确认弹窗 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open: boolean) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">
            确定要删除知识库 <span className="text-text font-medium">{deleteTarget?.name}</span> 吗？此操作不可恢复。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
