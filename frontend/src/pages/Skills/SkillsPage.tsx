import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useSkillStore } from '@/store/useSkillStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Plus,
  FileUp,
  FileText,
  Trash2,
  Pencil,
  Search,
  Upload,
  Code,
  Loader2,
  AlertCircle,
  User,
  Calendar,
} from 'lucide-react';
import type { Skill } from '@/types';

export const SkillsPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);
  const { skills, loading, error, loadSkills, createSkill, uploadSkillFile, updateSkill, deleteSkill } = useSkillStore();
  const isAdmin = currentUser?.role === 'admin';

  const [formOpen, setFormOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [tab, setTab] = useState<'paste' | 'upload'>('paste');
  const [skillName, setSkillName] = useState('');
  const [skillDescription, setSkillDescription] = useState('');
  const [skillContent, setSkillContent] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  const filtered = query.trim()
    ? skills.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()) ||
          s.content.toLowerCase().includes(query.toLowerCase()),
      )
    : skills;

  const resetForm = () => {
    setEditingSkill(null);
    setSkillName('');
    setSkillDescription('');
    setSkillContent('');
    setUploadFile(null);
    setTab('paste');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingSkill) {
        await updateSkill(editingSkill.id, { name: skillName.trim(), description: skillDescription.trim(), content: skillContent.trim() });
      } else if (tab === 'paste') {
        if (!skillName.trim() || !skillContent.trim()) return;
        await createSkill(skillName.trim(), skillContent.trim(), skillDescription.trim());
      } else {
        if (!uploadFile) return;
        await uploadSkillFile(uploadFile);
      }
      setFormOpen(false);
      resetForm();
    } catch {
      // error handled by store
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget === null) return;
    await deleteSkill(deleteTarget);
    setDeleteTarget(null);
  };

  const openAdd = () => {
    resetForm();
    setFormOpen(true);
  };

  const openEdit = (skill: Skill) => {
    setEditingSkill(skill);
    setSkillName(skill.name);
    setSkillDescription(skill.description);
    setSkillContent(skill.content);
    setTab('paste');
    setFormOpen(true);
  };

  const canEdit = (ownerId: number) => isAdmin || ownerId === currentUser?.id;

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Code size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">技能管理</h2>
          <span className="text-xs text-text-mute ml-2">{skills.length} 个技能</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索技能..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={openAdd} className="gap-1.5">
            <Plus size={14} />
            添加技能
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载技能列表...</p>
          </div>
        ) : error && skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <AlertCircle size={28} className="text-warning" />
            <p className="text-sm">加载失败：{error}</p>
            <Button variant="ghost" size="sm" onClick={loadSkills}>重试</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Code size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的技能' : '暂无技能'}</p>
            {!query && (
              <Button variant="ghost" size="sm" onClick={openAdd}>添加第一个技能</Button>
            )}
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-warning/10 text-warning text-xs">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map((skill) => (
                <div
                  key={skill.id}
                  className="group flex flex-col p-4 rounded-xl border border-border bg-bg-2 hover:bg-bg-hover hover:border-border-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-bg-3 border border-border inline-flex items-center justify-center shrink-0">
                        <Code size={18} className="text-accent" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium text-text truncate">{skill.name}</h3>
                        {skill.filename && (
                          <p className="text-2xs text-text-mute truncate mt-0.5">{skill.filename}</p>
                        )}
                        {skill.description && (
                          <p className="text-2xs text-text-dim truncate mt-0.5">{skill.description}</p>
                        )}
                      </div>
                    </div>
                    {canEdit(skill.ownerId) && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(skill); }}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-active transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(skill.id); }}
                          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-error hover:bg-error/10 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-text-dim mt-3 line-clamp-4 h-12 whitespace-pre-wrap break-words">
                    {skill.content.slice(0, 200)}{skill.content.length > 200 ? '...' : ''}
                  </p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-2xs text-text-mute">
                    <span className="flex items-center gap-1">
                      <User size={11} />
                      {skill.ownerUsername ?? `#${skill.ownerId}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={11} />
                      {skill.createdAt}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 添加/编辑技能弹窗 */}
      <Dialog open={formOpen} onOpenChange={(open) => { if (!open) { setFormOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-[600px]">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingSkill ? '编辑技能' : '添加技能'}</DialogTitle>
              <DialogDescription>{editingSkill ? '修改技能名称和内容' : '粘贴 Markdown 内容或上传 .md 文件'}</DialogDescription>
            </DialogHeader>
            {!editingSkill && (
              <div className="flex gap-1 mb-4 mt-2 border-b border-border">
                <button
                  type="button"
                  onClick={() => setTab('paste')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    tab === 'paste'
                      ? 'border-accent text-text'
                      : 'border-transparent text-text-dim hover:text-text'
                  }`}
                >
                  <FileText size={14} className="inline mr-1.5" />
                  粘贴内容
                </button>
                <button
                  type="button"
                  onClick={() => setTab('upload')}
                  className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                    tab === 'upload'
                      ? 'border-accent text-text'
                      : 'border-transparent text-text-dim hover:text-text'
                  }`}
                >
                  <FileUp size={14} className="inline mr-1.5" />
                  上传文件
                </button>
              </div>
            )}

            {editingSkill || tab === 'paste' ? (
              <div className="grid gap-3 py-2">
                <div className="grid gap-1.5">
                  <label className="text-xs text-text-dim">技能名称</label>
                  <Input
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    placeholder="输入技能名称"
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-text-dim">描述</label>
                  <Input
                    value={skillDescription}
                    onChange={(e) => setSkillDescription(e.target.value)}
                    placeholder="简要描述技能用途（可选）"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-xs text-text-dim">Markdown 内容</label>
                  <Textarea
                    value={skillContent}
                    onChange={(e) => setSkillContent(e.target.value)}
                    placeholder="粘贴 Markdown 内容..."
                    rows={12}
                    required
                    className="font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div className="py-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-border hover:border-accent cursor-pointer transition-colors"
                >
                  <Upload size={32} className="text-text-mute" />
                  <p className="text-sm text-text-dim">
                    {uploadFile ? uploadFile.name : '点击选择 .md 文件'}
                  </p>
                  {uploadFile && (
                    <p className="text-2xs text-text-mute">
                      {(uploadFile.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md"
                  className="hidden"
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => { setFormOpen(false); resetForm(); }}>
                取消
              </Button>
              <Button type="submit" disabled={submitting || (editingSkill ? false : tab === 'paste' ? !skillName.trim() || !skillContent.trim() : !uploadFile)}>
                {submitting && <Loader2 size={14} className="animate-spin mr-1" />}
                {editingSkill ? '保存' : tab === 'paste' ? '创建' : '上传'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">确定要删除该技能吗？此操作不可恢复。</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
