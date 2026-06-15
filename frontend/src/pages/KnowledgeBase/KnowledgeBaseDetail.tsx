import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { KnowledgeBaseForm } from './KnowledgeBaseForm';
import { Button } from '@/components/ui/button';
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
} from 'lucide-react';

export const KnowledgeBaseDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const knowledgeBases = useAppStore((s) => s.knowledgeBases);
  const updateKnowledgeBase = useAppStore((s) => s.updateKnowledgeBase);
  const deleteKnowledgeBase = useAppStore((s) => s.deleteKnowledgeBase);
  const addFileToKnowledgeBase = useAppStore((s) => s.addFileToKnowledgeBase);
  const removeFileFromKnowledgeBase = useAppStore((s) => s.removeFileFromKnowledgeBase);

  const kb = knowledgeBases.find((k) => k.id === id);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteFileTarget, setDeleteFileTarget] = useState<string | null>(null);

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

  const handleEdit = (name: string, description: string) => {
    updateKnowledgeBase(kb.id, { name, description });
  };

  const handleDeleteKb = () => {
    deleteKnowledgeBase(kb.id);
    navigate('/knowledge-base');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((f) => {
      const newFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        size: f.size > 1024 * 1024
          ? `${(f.size / 1024 / 1024).toFixed(1)} MB`
          : `${Math.ceil(f.size / 1024)} KB`,
        type: f.name.split('.').pop() || 'unknown',
        uploadedAt: new Date().toLocaleDateString('zh-CN'),
      };
      addFileToKnowledgeBase(kb.id, newFile);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveFile = () => {
    if (deleteFileTarget) {
      removeFileFromKnowledgeBase(kb.id, deleteFileTarget);
      setDeleteFileTarget(null);
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
            <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              添加文件
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {kb.files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-text-dim gap-2 border border-dashed border-border rounded-xl">
              <File size={28} className="text-text-mute opacity-50" />
              <p className="text-xs">暂无文件，点击上方按钮添加</p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-bg-2 text-text-dim text-xs">
                    <th className="text-left px-4 py-2.5 font-medium">文件名</th>
                    <th className="text-left px-4 py-2.5 font-medium w-24">类型</th>
                    <th className="text-left px-4 py-2.5 font-medium w-24">大小</th>
                    <th className="text-left px-4 py-2.5 font-medium w-28">上传时间</th>
                    <th className="text-right px-4 py-2.5 font-medium w-14">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {kb.files.map((f) => (
                    <tr key={f.id} className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-2.5 text-text flex items-center gap-2">
                        <File size={14} className={getFileIcon(f.type)} />
                        <span className="truncate max-w-[240px]">{f.name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-text-dim text-xs uppercase">{f.type}</td>
                      <td className="px-4 py-2.5 text-text-dim text-xs">{f.size}</td>
                      <td className="px-4 py-2.5 text-text-mute text-xs">{f.uploadedAt}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setDeleteFileTarget(f.id)}
                          className="w-6 h-6 inline-flex items-center justify-center rounded text-text-dim hover:text-error hover:bg-error/10 transition-colors"
                        >
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </main>
  );
};
