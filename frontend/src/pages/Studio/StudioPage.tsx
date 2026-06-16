import React, { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useStudioStore } from '@/store/useStudioStore';
import { StudioAppCard } from './StudioAppCard';
import { CreateAppDialog } from './CreateAppDialog';
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
  LayoutGrid,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { App } from '@/types';

const PAGE_SIZE = 8;

export const StudioPage: React.FC = () => {
  const apps = useStudioStore((s) => s.apps);
  const loading = useStudioStore((s) => s.loading);
  const error = useStudioStore((s) => s.error);
  const loadApps = useStudioStore((s) => s.loadApps);
  const createApp = useStudioStore((s) => s.createApp);
  const deleteApp = useStudioStore((s) => s.deleteApp);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<App | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }, [apps, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleCreate = async (payload: { name: string; icon?: string; description?: string }) => {
    setSubmitting(true);
    try {
      await createApp(payload);
      setCurrentPage(1);
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteApp(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const toggleShowAll = () => {
    setShowAll((prev) => {
      const next = !prev;
      loadApps(next);
      return next;
    });
  };

  const goPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">工作室</h2>
          <span className="text-xs text-text-mute ml-2">{filtered.length} 个应用</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
              placeholder="搜索应用..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={() => { setEditingApp(undefined); setFormOpen(true); }} className="gap-1.5" disabled={submitting}>
            <Plus size={14} />
            创建应用
          </Button>
        </div>
      </div>

      {/* Admin toggle */}
      {isAdmin && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0">
          <button
            onClick={toggleShowAll}
            className={`px-2.5 py-1 rounded-full text-2xs transition-colors ${
              showAll
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-2 text-text-dim border border-border hover:bg-bg-3'
            }`}
          >
            {showAll ? '全部应用' : '我的应用'}
          </button>
          {showAll && (
            <span className="text-2xs text-text-mute">显示所有用户的应用</span>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载应用列表...</p>
          </div>
        ) : error && apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <AlertCircle size={28} className="text-warning" />
            <p className="text-sm">无法连接后端：{error}</p>
            <Button variant="ghost" size="sm" onClick={() => loadApps(showAll)}>重试</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <LayoutGrid size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的应用' : '暂无应用'}</p>
            {!query && (
              <Button variant="ghost" size="sm" onClick={() => { setEditingApp(undefined); setFormOpen(true); }}>
                创建第一个应用
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {paginated.map((app) => (
                <StudioAppCard
                  key={app.id}
                  app={app}
                  onEdit={(a) => { setEditingApp(a); setFormOpen(true); }}
                  onDelete={(a) => setDeleteTarget(a)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                <button onClick={() => goPage(safePage - 1)} disabled={safePage <= 1}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => goPage(p)}
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-md text-xs transition-colors ${
                      p === safePage ? 'bg-accent text-white' : 'text-text-dim hover:text-text hover:bg-bg-hover'
                    }`}>{p}</button>
                ))}
                <button onClick={() => goPage(safePage + 1)} disabled={safePage >= totalPages}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <CreateAppDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editingApp}
        onSubmit={handleCreate}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">
            确定要删除应用 <span className="text-text font-medium">{deleteTarget?.name}</span> 吗？此操作不可恢复。
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
