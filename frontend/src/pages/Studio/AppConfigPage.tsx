import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useStudioStore } from '@/store/useStudioStore';
import { useConversationStore } from '@/store/useConversationStore';
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
  Eye,
  EyeOff,
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
  const [showPreview, setShowPreview] = useState(false);
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversation_id');
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const resetConversations = useConversationStore((s) => s.reset);

  // Provider/Model dropdown data
  const [activeProviders, setActiveProviders] = useState<{ provider_name: string; label: string; models: { name: string; context: number }[] }[]>([]);
  const [availableModels, setAvailableModels] = useState<{ name: string; context: number }[]>([]);

  const activeModel = availableModels.find((m) => m.name === model);
  const maxTokens = activeModel?.context ?? 128000;

  // Skills & KBs
  const [availableSkills, setAvailableSkills] = useState<{ id: number; name: string }[]>([]);
  const [availableKbs, setAvailableKbs] = useState<{ id: number; name: string }[]>([]);

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

  // Load conversations when app is loaded
  useEffect(() => {
    if (app) {
      loadConversations(app.id);
    }
    return () => { resetConversations(); };
  }, [app?.id]);

  // Fetch active providers
  useEffect(() => {
    (async () => {
      try {
        const { api } = await import('@/lib/api');
        const providers = await api.fetchActiveModels();
        setActiveProviders(providers);
      } catch {
        // 忽略错误，下拉列表为空
      }
    })();
  }, []);

  // When provider changes, update available models
  useEffect(() => {
    const p = activeProviders.find((p) => p.provider_name === provider);
    setAvailableModels(p?.models || []);
    if (p && !p.models.some((m) => m.name === model)) {
      setModel('');
    }
  }, [provider, activeProviders, model]);

  // Fetch skills and KBs
  useEffect(() => {
    (async () => {
      try {
        const { api } = await import('@/lib/api');
        const [skills, kbs] = await Promise.all([
          api.listSkills(),
          api.listKbs(),
        ]);
        setAvailableSkills(skills.map((s: any) => ({ id: s.id, name: s.name })));
        setAvailableKbs(kbs.map((kb: any) => ({ id: Number(kb.id), name: kb.name })));
      } catch {
        // 忽略
      }
    })();
  }, []);

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
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
            {showPreview ? '隐藏预览' : '预览'}
          </Button>
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
        <div className="w-[640px] overflow-y-auto px-6 py-5 shrink-0">
          <div className="space-y-6">
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
                  <select
                    id="cfg-provider"
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-border bg-bg-2 px-3 py-1 text-xs text-text shadow-sm transition-colors placeholder:text-text-mute focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <option value="">-- 选择 Provider --</option>
                    {activeProviders.map((p) => (
                      <option key={p.provider_name} value={p.provider_name}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  {activeProviders.length === 0 && (
                    <p className="text-2xs text-text-mute">暂无可用模型插件，请先到插件管理配置并安装</p>
                  )}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cfg-model">模型</Label>
                  <select
                    id="cfg-model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="flex h-9 w-full rounded-lg border border-border bg-bg-2 px-3 py-1 text-xs text-text shadow-sm transition-colors placeholder:text-text-mute focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    disabled={!provider}
                  >
                    <option value="">-- 选择模型 --</option>
                    {availableModels.map((m) => (
                      <option key={m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
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

            {/* Skills */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">技能配置</h3>
              {availableSkills.length === 0 ? (
                <p className="text-xs text-text-dim">暂无技能，请先到技能管理页面创建</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {availableSkills.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={skillIds.includes(s.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSkillIds([...skillIds, s.id]);
                          } else {
                            setSkillIds(skillIds.filter((id) => id !== s.id));
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-text">{s.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Knowledge Bases */}
            <div>
              <h3 className="text-sm font-medium text-text mb-3">关联知识库</h3>
              {availableKbs.length === 0 ? (
                <p className="text-xs text-text-dim">暂无知识库，请先创建</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5">
                  {availableKbs.map((kb) => (
                    <label key={kb.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-bg-hover cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={kbIds.includes(kb.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setKbIds([...kbIds, kb.id]);
                          } else {
                            setKbIds(kbIds.filter((id) => id !== kb.id));
                          }
                        }}
                        className="rounded border-border"
                      />
                      <span className="text-text">{kb.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right panel */}
        {showPreview && (
          <div className="flex-1 border-l border-border flex flex-col min-w-0 animate-in slide-in-from-right">
            <StudioChatPreview
              appId={app.id}
              config={{ model, provider, prompt, skill_ids: skillIds, kb_ids: kbIds, maxTokens }}
              conversationId={conversationId ? Number(conversationId) : undefined}
            />
          </div>
        )}
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
