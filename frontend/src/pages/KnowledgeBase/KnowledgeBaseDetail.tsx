import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { KnowledgeBaseForm } from './KnowledgeBaseForm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileText,
  Pencil,
  Trash2,
  Upload,
  FolderOpen,
  File,
  X,
  Loader2,
  AlertCircle,
  ClipboardPaste,
  Eye,
  Scissors,
  Power,
  PowerOff,
  Check,
} from 'lucide-react';
import type { DocumentChunk, KbCreatePayload } from '@/types';
import { api } from '@/lib/api';

export const KnowledgeBaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const knowledgeBases = useAppStore((s) => s.knowledgeBases);
  const updateKnowledgeBase = useAppStore((s) => s.updateKnowledgeBase);
  const deleteKnowledgeBase = useAppStore((s) => s.deleteKnowledgeBase);
  const loadFiles = useAppStore((s) => s.loadFiles);
  const uploadFiles = useAppStore((s) => s.uploadFiles);
  const uploadTextDocument = useAppStore((s) => s.uploadTextDocument);
  const removeFileFromKnowledgeBase = useAppStore((s) => s.removeFileFromKnowledgeBase);
  const reindexDocument = useAppStore((s) => s.reindexDocument);
  const reindexDocuments = useAppStore((s) => s.reindexDocuments);
  const toggleDocumentEnabled = useAppStore((s) => s.toggleDocumentEnabled);
  const toggleDocumentsEnabled = useAppStore((s) => s.toggleDocumentsEnabled);

  const kb = knowledgeBases.find((k) => k.id === id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [textOpen, setTextOpen] = useState(false);
  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [textType, setTextType] = useState<'md' | 'txt'>('md');
  const [textSubmitting, setTextSubmitting] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);

  // 分片预览弹窗
  const [chunksOpen, setChunksOpen] = useState(false);
  const [chunksDocName, setChunksDocName] = useState<string>('');
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  // 分片编辑
  const [editingChunkId, setEditingChunkId] = useState<number | null>(null);
  const [editingChunkContent, setEditingChunkContent] = useState('');
  const [savingChunk, setSavingChunk] = useState(false);

  // 多选 + 分片状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reindexingIds, setReindexingIds] = useState<Set<string>>(new Set());
  const [reindexError, setReindexError] = useState<string | null>(null);
  const [batchReindexing, setBatchReindexing] = useState(false);

  // 启用/禁用
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [batchToggling, setBatchToggling] = useState(false);

  const handleToggleEnabledOne = async (fileId: string) => {
    setReindexError(null);
    setTogglingIds((prev) => new Set(prev).add(fileId));
    try {
      await toggleDocumentEnabled(kb!.id, fileId);
    } catch (e) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleToggleEnabledBatch = async (enabled: boolean) => {
    if (selectedIds.size === 0) return;
    setReindexError(null);
    const ids = Array.from(selectedIds);
    setTogglingIds(new Set(ids));
    setBatchToggling(true);
    try {
      await toggleDocumentsEnabled(kb!.id, ids, enabled);
      clearSelection();
    } catch (e) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setTogglingIds(new Set());
      setBatchToggling(false);
    }
  };

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const toggleSelectAll = (allIds: string[], allSelected: boolean) => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleReindexOne = async (fileId: string) => {
    setReindexError(null);
    setReindexingIds((prev) => new Set(prev).add(fileId));
    try {
      await reindexDocument(kb!.id, fileId);
    } catch (e) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexingIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  const handleReindexBatch = async () => {
    if (selectedIds.size === 0) return;
    setReindexError(null);
    const ids = Array.from(selectedIds);
    setReindexingIds(new Set(ids));
    setBatchReindexing(true);
    try {
      const resp = await reindexDocuments(kb!.id, ids);
      const failed = resp.results.filter((r) => r.status === 'error');
      if (failed.length > 0) {
        setReindexError(
          `${failed.length}/${resp.results.length} 个文档分片失败：` +
            failed.map((f) => f.error || `#${f.doc_id}`).join('；'),
        );
      } else {
        // 全部成功 → 清空选择
        clearSelection();
      }
    } catch (e) {
      setReindexError(e instanceof Error ? e.message : String(e));
    } finally {
      setReindexingIds(new Set());
      setBatchReindexing(false);
    }
  };

  const handleViewChunks = async (docId: string | number, docName: string) => {
    setChunksOpen(true);
    setChunksDocName(docName);
    setChunks([]);
    setChunksError(null);
    setChunksLoading(true);
    try {
      const data = await api.fetchDocumentChunks(docId);
      setChunks(data);
    } catch (e) {
      setChunksError(e instanceof Error ? e.message : '加载分片失败');
    } finally {
      setChunksLoading(false);
    }
  };

  const handleSaveChunk = async (chunkId: number) => {
    const trimmed = editingChunkContent.trim();
    if (!trimmed) return;
    setSavingChunk(true);
    try {
      const updated = await api.updateChunk(chunkId, trimmed);
      setChunks((prev) => prev.map((c) => (c.id === chunkId ? { ...c, content: updated.content } : c)));
      setEditingChunkId(null);
      setEditingChunkContent('');
    } catch (e) {
      setChunksError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingChunk(false);
    }
  };

  // 进入详情页拉取该知识库的文件列表
  useEffect(() => {
    if (id) loadFiles(id);
  }, [id, loadFiles]);

  if (!kb) {
    return (
      <main className="flex flex-col items-center justify-center bg-bg h-full text-text-dim gap-3">
        <FolderOpen size={40} className="text-text-mute opacity-50" />
        <p className="text-sm">知识库不存在或已被删除</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/knowledge-base')}>
          返回知识库列表
        </Button>
      </main>
    );
  }

  const handleEdit = (payload: KbCreatePayload) => {
    updateKnowledgeBase(kb.id, { name: payload.name, description: payload.description });
  };

  const handleDeleteKb = async () => {
    await deleteKnowledgeBase(kb.id);
    navigate('/knowledge-base');
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      await uploadFiles(kb.id, Array.from(files));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = async () => {
    if (deleteFileTarget) {
      await removeFileFromKnowledgeBase(kb.id, deleteFileTarget);
      setDeleteFileTarget(null);
    }
  };

  const handleSubmitText = async () => {
    if (!textTitle.trim()) {
      setTextError('标题不能为空');
      return;
    }
    if (!textContent.trim()) {
      setTextError('内容不能为空');
      return;
    }
    setTextSubmitting(true);
    setTextError(null);
    try {
      await uploadTextDocument(kb.id, {
        title: textTitle.trim(),
        content: textContent,
        file_type: textType,
      });
      // 成功 → 关闭并清空
      setTextOpen(false);
      setTextTitle('');
      setTextContent('');
      setTextType('md');
    } catch (err) {
      setTextError(err instanceof Error ? err.message : String(err));
    } finally {
      setTextSubmitting(false);
    }
  };


  const getFileIcon = (type: string) => {
    const colorMap: Record<string, string> = {
      md: 'text-[#c8cfd8]',
      js: 'text-[#f5d76e]',
      ts: 'text-[#6ec1ff]',
      css: 'text-[#6ec1ff]',
      html: 'text-[#ff8c69]',
      json: 'text-[#c8cfd8]',
    };
    return colorMap[type] || 'text-text-dim';
  };

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/knowledge-base')}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-xs text-text-mute">知识库</span>
          <span className="text-xs text-text-mute">/</span>
          <h2 className="text-sm font-medium text-text truncate max-w-[300px]">{kb.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Pencil size={13} />
            编辑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-error hover:text-error hover:bg-error/10"
            onClick={handleDeleteKb}
          >
            <Trash2 size={13} />
            删除
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* 元信息 */}
        <div className="max-w-[720px]">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-bg-3 border border-border inline-flex items-center justify-center shrink-0">
              <FileText size={20} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-medium text-text">{kb.name}</h1>
              <p className="text-sm text-text-dim mt-1">{kb.description || '暂无描述'}</p>
              <div className="flex items-center gap-3 mt-2 text-2xs text-text-mute">
                <span>{kb.files.length} 个文件</span>
                <span>·</span>
                <span>创建于 {kb.createdAt}</span>
                <span>·</span>
                <span>更新于 {kb.updatedAt}</span>
              </div>
            </div>
          </div>

          <Separator className="mb-5" />

          {/* 文件管理 */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-text">文件列表</h3>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => setTextOpen(true)}
              >
                <ClipboardPaste size={14} />
                粘贴文本
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {uploading ? '上传中...' : '添加文件'}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
              <AlertCircle size={14} />
              <span>上传失败：{uploadError}</span>
            </div>
          )}

          {reindexError && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span className="break-all">{reindexError}</span>
              <button
                type="button"
                onClick={() => setReindexError(null)}
                className="ml-auto opacity-60 hover:opacity-100"
              >
                <X size={12} />
              </button>
            </div>
          )}

          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 rounded-md bg-accent/10 border border-accent/30 text-xs">
              <span className="text-text">
                已选 <span className="font-medium text-accent">{selectedIds.size}</span> 个文件
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="gap-1.5 h-7"
                  disabled={batchReindexing || batchToggling}
                  onClick={handleReindexBatch}
                >
                  {batchReindexing ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Scissors size={12} />
                  )}
                  {batchReindexing ? '分片中...' : '分片选中'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7"
                  disabled={batchReindexing || batchToggling}
                  onClick={() => handleToggleEnabledBatch(true)}
                  title="将选中文档全部启用"
                >
                  <Power size={12} />
                  启用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 h-7 text-text-dim"
                  disabled={batchReindexing || batchToggling}
                  onClick={() => handleToggleEnabledBatch(false)}
                  title="将选中文档全部禁用"
                >
                  <PowerOff size={12} />
                  禁用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  disabled={batchReindexing || batchToggling}
                  onClick={clearSelection}
                >
                  取消选择
                </Button>
              </div>
            </div>
          )}

          {kb.files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-dim gap-2 border border-dashed border-border rounded-xl">
              <File size={28} className="text-text-mute opacity-50" />
              <p className="text-xs">暂无文件，点击上方按钮添加</p>
            </div>
          ) : (
            (() => {
              const allIds = kb.files.map((f) => f.id);
              const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));
              const someSelected = selectedIds.size > 0 && !allSelected;
              return (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-2 text-text-dim text-xs">
                    <th className="px-3 py-2.5 font-medium w-9">
                      <input
                        type="checkbox"
                        aria-label="全选"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someSelected;
                        }}
                        onChange={() => toggleSelectAll(allIds, allSelected)}
                        className="cursor-pointer accent-accent"
                      />
                    </th>
                    <th className="text-left px-4 py-2.5 font-medium">文件名</th>
                    <th className="text-left px-4 py-2.5 font-medium w-24">类型</th>
                    <th className="text-left px-4 py-2.5 font-medium w-24">大小</th>
                    <th className="text-left px-4 py-2.5 font-medium w-28">上传时间</th>
                    <th className="text-right px-4 py-2.5 font-medium w-40">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kb.files.map((f) => {
                    const isReindexing =
                      reindexingIds.has(f.id) || f.status === 'indexing';
                    const isToggling = togglingIds.has(f.id);
                    const hasChunks = (f.chunkCount ?? 0) > 0;
                    const isDisabled = f.enabled === false;
                    return (
                    <tr
                      key={f.id}
                      className={`hover:bg-bg-hover transition-colors ${
                        isDisabled ? 'opacity-55' : ''
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`选择 ${f.name}`}
                          checked={selectedIds.has(f.id)}
                          onChange={() => toggleSelect(f.id)}
                          className="cursor-pointer accent-accent"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-text">
                        <button
                          type="button"
                          onClick={() => handleViewChunks(f.id, f.name)}
                          className="flex items-center gap-2 max-w-full hover:text-accent transition-colors group"
                          title="查看分片"
                        >
                          <File size={14} className={getFileIcon(f.type)} />
                          <span
                            className={`truncate max-w-[240px] underline-offset-4 group-hover:underline ${
                              isDisabled ? 'line-through text-text-dim' : ''
                            }`}
                          >
                            {f.name}
                          </span>
                          {isReindexing && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-info/15 text-info shrink-0">
                              <Loader2 size={10} className="animate-spin" />
                              分片中
                            </span>
                          )}
                          {f.status === 'error' && !isReindexing && (
                            <span className="px-1.5 py-0.5 rounded text-2xs bg-error/15 text-error shrink-0">
                              失败
                            </span>
                          )}
                          {isDisabled && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-text-mute/15 text-text-dim shrink-0">
                              <PowerOff size={10} />
                              已禁用
                            </span>
                          )}
                          <Eye
                            size={12}
                            className="opacity-0 group-hover:opacity-60 shrink-0"
                          />
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-text-dim text-xs uppercase">{f.type}</td>
                      <td className="px-4 py-2.5 text-text-dim text-xs">{f.size}</td>
                      <td className="px-4 py-2.5 text-text-mute text-xs">{f.uploadedAt}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            onClick={() => handleViewChunks(f.id, f.name)}
                            className="w-6 h-6 inline-flex items-center justify-center rounded text-text-dim hover:text-accent hover:bg-accent/10 transition-colors"
                            title="查看分片"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleEnabledOne(f.id)}
                            disabled={isToggling || isReindexing}
                            className={`w-6 h-6 inline-flex items-center justify-center rounded transition-colors disabled:opacity-50 disabled:hover:bg-transparent ${
                              isDisabled
                                ? 'text-text-mute hover:text-success hover:bg-success/10'
                                : 'text-text-dim hover:text-warning hover:bg-warning/10'
                            }`}
                            title={isDisabled ? '启用文档（参与检索）' : '禁用文档（不参与检索）'}
                          >
                            {isToggling ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : isDisabled ? (
                              <Power size={13} />
                            ) : (
                              <PowerOff size={13} />
                            )}
                          </button>
                          <button
                            onClick={() => handleReindexOne(f.id)}
                            disabled={isReindexing || isToggling}
                            className="w-6 h-6 inline-flex items-center justify-center rounded text-text-dim hover:text-info hover:bg-info/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-dim"
                            title={hasChunks ? '重新分片' : '开始分片'}
                          >
                            {isReindexing ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Scissors size={13} />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteFileTarget(f.id)}
                            disabled={isReindexing || isToggling}
                            className="w-6 h-6 inline-flex items-center justify-center rounded text-text-dim hover:text-error hover:bg-error/10 transition-colors disabled:opacity-50"
                            title="删除文档"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
              );
            })()
          )}
        </div>
      </div>

      {/* 编辑弹窗 */}
      <KnowledgeBaseForm
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={kb}
        onSubmit={handleEdit}
      />

      {/* 删除文件确认 */}
      <Dialog open={!!deleteFileTarget} onOpenChange={(open) => !open && setDeleteFileTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>移除文件</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">
            确定要从知识库中移除此文件吗？
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteFileTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleRemoveFile}>移除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 粘贴文本 */}
      <Dialog open={textOpen} onOpenChange={(open) => { if (!textSubmitting) setTextOpen(open); }}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>粘贴文本内容</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="text-title">标题</Label>
              <Input
                id="text-title"
                value={textTitle}
                onChange={(e) => { setTextTitle(e.target.value); setTextError(null); }}
                placeholder="例如：产品说明.md"
                disabled={textSubmitting}
              />
            </div>
            <div className="grid gap-2">
              <Label>类型</Label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="text-type"
                    value="md"
                    checked={textType === 'md'}
                    onChange={() => setTextType('md')}
                    disabled={textSubmitting}
                  />
                  Markdown
                </label>
                <label className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="text-type"
                    value="txt"
                    checked={textType === 'txt'}
                    onChange={() => setTextType('txt')}
                    disabled={textSubmitting}
                  />
                  纯文本
                </label>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="text-content">内容</Label>
              <Textarea
                id="text-content"
                value={textContent}
                onChange={(e) => { setTextContent(e.target.value); setTextError(null); }}
                placeholder={textType === 'md'
                  ? '# 标题\n\n粘贴或输入 Markdown 内容...'
                  : '粘贴或输入纯文本内容...'}
                rows={14}
                className="font-mono text-xs"
                disabled={textSubmitting}
              />
              <p className="text-2xs text-text-mute">
                {textContent.length} 字符
              </p>
            </div>
            {textError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
                <AlertCircle size={14} />
                <span>{textError}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTextOpen(false)} disabled={textSubmitting}>
              取消
            </Button>
            <Button onClick={handleSubmitText} disabled={textSubmitting}>
              {textSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  索引中...
                </>
              ) : (
                '提交'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 分片预览 */}
      <Dialog open={chunksOpen} onOpenChange={setChunksOpen}>
        <DialogContent className="sm:max-w-[760px] max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <FileText size={14} className="text-accent" />
              <span className="truncate">{chunksDocName}</span>
              {!chunksLoading && !chunksError && (
                <span className="text-xs text-text-dim font-normal">
                  · 共 {chunks.length} 个分片
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {chunksLoading && (
              <div className="flex items-center justify-center py-12 text-text-dim text-sm gap-2">
                <Loader2 size={14} className="animate-spin" />
                加载中...
              </div>
            )}

            {chunksError && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
                <AlertCircle size={14} />
                <span>{chunksError}</span>
              </div>
            )}

            {!chunksLoading && !chunksError && chunks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-text-dim text-xs gap-2">
                <File size={24} className="text-text-mute opacity-50" />
                <p>该文档暂无分片，可能仍在索引中</p>
              </div>
            )}

            {!chunksLoading && !chunksError && chunks.length > 0 && (
              <div className="space-y-2">
                {chunks.map((c, idx) => (
                  <div
                    key={c.id}
                    className="border border-border rounded-md p-3 bg-bg-2/40 hover:bg-bg-2 transition-colors group/chunk"
                  >
                    <div className="flex items-center justify-between mb-1.5 text-xs text-text-dim">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded bg-accent/15 text-accent font-medium text-2xs">
                          #{idx + 1}
                        </span>
                        <span>chunk_id: {c.id}</span>
                        {c.parentChunkId !== null && (
                          <span className="px-1.5 py-0.5 rounded text-2xs bg-info/15 text-info">
                            子块 · 父 #{c.parentChunkId}
                          </span>
                        )}
                      </div>
                      <span className="text-2xs">
                        {c.tokenCount} tokens · {c.content.length} 字符
                      </span>
                    </div>
                    {editingChunkId === c.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingChunkContent}
                          onChange={(e) => setEditingChunkContent(e.target.value)}
                          className="w-full min-h-[80px] bg-bg-active border border-border rounded p-2 text-xs text-text font-mono outline-none resize-y"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => { setEditingChunkId(null); setEditingChunkContent(''); }}
                            className="px-2 py-1 text-2xs rounded bg-bg-3 border border-border text-text-dim hover:text-text transition-colors"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleSaveChunk(c.id)}
                            disabled={savingChunk}
                            className="px-2 py-1 text-2xs rounded bg-accent text-white hover:bg-accent/90 transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            {savingChunk ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <pre className="text-xs text-text whitespace-pre-wrap break-words font-sans leading-relaxed">
                          {c.content}
                        </pre>
                        <button
                          onClick={() => { setEditingChunkId(c.id); setEditingChunkContent(c.content); }}
                          className="mt-1.5 text-2xs text-text-dim hover:text-text transition-colors flex items-center gap-1 opacity-0 group-hover/chunk:opacity-100"
                        >
                          <Pencil size={10} />
                          修改
                        </button>
                      </>
                    )}
                    {c.parentContent && editingChunkId !== c.id && (
                      <details className="mt-2">
                        <summary className="text-2xs text-text-dim cursor-pointer hover:text-text">
                          查看父块完整内容
                        </summary>
                        <pre className="mt-1.5 text-xs text-text-dim whitespace-pre-wrap break-words font-sans leading-relaxed border-l-2 border-info/40 pl-2">
                          {c.parentContent}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setChunksOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
