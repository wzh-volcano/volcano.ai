import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudioStore } from '@/store/useStudioStore';
import { StudioChatPreview } from './StudioChatPreview';
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
  Save,
  Trash2,
  LayoutGrid,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';


export const AppConfigPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const apps = useStudioStore((s) => s.apps);
  const loadApps = useStudioStore((s) => s.loadApps);
  const updateApp = useStudioStore((s) => s.updateApp);
  const deleteApp = useStudioStore((s) => s.deleteApp);
  const toggleStatus = useStudioStore((s) => s.toggleStatus);

  const app = apps.find((a) => a.id === Number(id));

  useEffect(() => {
    if (apps.length === 0) loadApps();
  }, [apps.length, loadApps]);

  // Form state
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [description, setDescription] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [prompt, setPrompt] = useState('');
  const [skillIds, setSkillIds] = useState<number[]>([]);
  const [kbIds, setKbIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(false);

  useEffect(() => {
    if (app) {
      setName(app.name);
      setIcon(app.icon);
      setDescription(app.description);
      try {
        const config = JSON.parse(app.configJson || '{}');
        setModel(config.model || '');
        setProvider(config.provider || '');
        setPrompt(config.prompt || '');
        setSkillIds(config.skill_ids || []);
        setKbIds(config.kb_ids || []);
      } catch {
        // 解析失败用默认值
      }
    }
  }, [app]);

  const handleSave = async () => {
    if (!app) return;
    setSaving(true);
    setSaveError('');
    setSaveSuccess(false);
    try {
      const configJson = JSON.stringify({ model, provider, prompt, skill_ids: skillIds, kb_ids: kbIds });
      await updateApp(app.id, { name, icon, description, config_json: configJson });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!app) return;
    await deleteApp(app.id);
    navigate('/studio');
  };

  const handleToggleStatus = async () => {
    if (!app) return;
    await toggleStatus(app.id);
    loadApps();
  };

  if (!app) {
    return (
      <main className="flex flex-col items-center justify-center bg-bg h-full text-text-dim gap-3">
        <LayoutGrid size={40} className="text-text-mute opacity-50" />
        <p className="text-sm">应用不存在或已被删除</p>
        <Button variant="ghost" size="sm" onClick={() => navigate('/studio')}>
          返回工作室
        </Button>
      </main>
    );
  }

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/studio')}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover transition-colors">
            <ArrowLeft size={16} />
          </button>
          <Separator orientation="vertical" className="h-5" />
          <span className="text-xs text-text-mute shrink-0">工作室</span>
          <span className="text-xs text-text-mute shrink-0">/</span>
          <h2 className="text-sm font-medium text-text truncate">{app.name}</h2>
          <span className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs ${
            app.status === 'published'
              ? 'bg-success/15 text-success'
              : 'bg-bg-3 text-text-dim border border-border'
          }`}>
            {app.status === 'published' ? '已发布' : '草稿'}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveSuccess && (
            <span className="flex items-center gap-1 text-xs text-success">
              <CheckCircle2 size={13} />
              已保存
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleToggleStatus}>
            {app.status === 'draft' ? '发布' : '设为草稿'}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            保存
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-error hover:text-error hover:bg-error/10"
            onClick={() => setDeleteTarget(true)}>
            <Trash2 size={13} />
            删除
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 px-6 py-2 bg-error/10 text-error text-xs">
          <AlertCircle size={14} />
          <span>{saveError}</span>
        </div>
      )}

      {/* Body: Left config + Right preview */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-[640px] space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">基本信息</h3>
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-name">应用名称</Label>
                  <Input id="cfg-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-icon">图标</Label>
                  <Input id="cfg-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🤖" className="w-24" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-desc">介绍</Label>
                  <Textarea id="cfg-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
                </div>
              </div>
            </div>

            <Separator />

            {/* Model */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">模型配置</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-provider">Provider</Label>
                  <Input id="cfg-provider" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="openai" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-model">模型</Label>
                  <Input id="cfg-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Prompt */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">提示词 (System Prompt)</h3>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="你是一个智能助手，请基于以下知识库回答用户问题..."
                rows={6}
                className="font-mono text-xs"
              />
            </div>

            <Separator />

            {/* Skills placeholder */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">技能配置</h3>
              <p className="text-xs text-text-dim">选择已有技能作为 System Prompt 模板（功能待实现）</p>
            </div>

            <Separator />

            {/* Knowledge Bases placeholder */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">关联知识库</h3>
              <p className="text-xs text-text-dim">选择知识库作为 RAG 数据源（功能待实现）</p>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-[400px] border-l border-border flex flex-col shrink-0">
          <StudioChatPreview appId={app.id} config={{ model, provider, prompt, skill_ids: skillIds, kb_ids: kbIds }} />
        </div>
      </div>

      {/* Delete dialog */}
      <Dialog open={deleteTarget} onOpenChange={setDeleteTarget}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">
            确定要删除应用 <span className="text-text font-medium">{app.name}</span> 吗？此操作不可恢复。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
