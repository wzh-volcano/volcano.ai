import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Upload,
  Link as LinkIcon,
  Puzzle,
  Search,
  MoreHorizontal,
  Settings,
  Trash2,
  Power,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Package,
  PackageCheck,
  RefreshCw,
  FileJson,
  Plus,
  X,
} from 'lucide-react';
import type { ExtensionPlugin, Plugin } from '@/types';

interface ConfigFormState {
  base_url: string;
  api_key: string;
  embedding_model: string;
  configured_models: { name: string; context: number }[];
}

const EMPTY_FORM: ConfigFormState = {
  base_url: '',
  api_key: '',
  embedding_model: '',
  configured_models: [],
};

type TabFilter = 'all' | 'model' | 'skill' | 'extension' | 'mcp_server';

const CATEGORY_LABEL: Record<string, string> = {
  model: '模型',
  skill: '技能',
  extension: '扩展',
  mcp_server: 'MCP Server',
};

export const PluginManagementPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);

  const [plugins, setPlugins] = useState<(Plugin | ExtensionPlugin)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [configTarget, setConfigTarget] = useState<Plugin | ExtensionPlugin | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // 配置弹窗：从厂商拉取的模型列表（供 LLM/Embedding 下拉建议）
  const [modelsList, setModelsList] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsInfo, setModelsInfo] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Plugin | ExtensionPlugin | null>(null);

  // 技能关键字配置
  const [skillConfig, setSkillConfig] = useState<{
    pluginName: string;
    skillName: string;
    keywords: string;
    matchMode: string;
  } | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<string>('skill');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const [manualModelName, setManualModelName] = useState('');
  const [manualModelContext, setManualModelContext] = useState('');

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const [query, setQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<TabFilter>('all');

  const isAdmin = currentUser?.role === 'admin';

  const loadPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelPlugins, extPlugins] = await Promise.all([
        api.listPlugins(),
        api.listExtensionPlugins(),
      ]);
      setPlugins([...modelPlugins, ...extPlugins]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadPlugins();
  }, [isAdmin]);

  const counts = useMemo(() => {
    const byCat: Record<string, number> = { model: 0, skill: 0, extension: 0, mcp_server: 0 };
    for (const p of plugins) {
      const c = p.category || 'model';
      byCat[c] = (byCat[c] ?? 0) + 1;
    }
    return { all: plugins.length, model: byCat.model ?? 0, skill: byCat.skill ?? 0, extension: byCat.extension ?? 0, mcp_server: byCat.mcp_server ?? 0 };
  }, [plugins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      const cat = p.category || 'model';
      if (tabFilter !== 'all' && cat !== tabFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    });
  }, [plugins, query, tabFilter]);

  const flash = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo(null), 2500);
  };

  // ---------- 配置 ----------
  const openConfig = (p: Plugin | ExtensionPlugin) => {
    let configured: { name: string; context: number }[] = [];
    const extraJson = (p as any).extraJson;
    if (extraJson) {
      try {
        const parsed = JSON.parse(extraJson);
        if (parsed.configured_models) {
          configured = parsed.configured_models;
        }
      } catch { /* ignore */ }
    }
    setConfigTarget(p);
    const plugin = p as Plugin;
    setConfigForm({
      base_url: plugin.baseUrl,
      api_key: '',
      embedding_model: plugin.embeddingModel,
      configured_models: configured,
    });
    setManualModelName('');
    setManualModelContext('');
    // 重置模型列表相关状态
    setModelsList([]);
    setModelsError(null);
    setModelsInfo(null);
  };

  const handleFetchModels = async () => {
    if (!configTarget) return;
    setModelsLoading(true);
    setModelsError(null);
    setModelsInfo(null);
    try {
      const models = await api.fetchPluginModels(configTarget.name, {
        base_url: configForm.base_url || undefined,
        api_key: configForm.api_key || undefined,
      });
      setModelsList(models);
      if (models.length === 0) {
        setModelsInfo('该厂商未返回任何模型，请手动添加');
      } else {
        setModelsInfo(`已获取 ${models.length} 个模型，点击勾选以添加`);
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : '拉取失败，可手动添加模型');
    } finally {
      setModelsLoading(false);
    }
  };

  const handleToggleModel = (modelName: string) => {
    setConfigForm((prev) => {
      const exists = prev.configured_models.find((m) => m.name === modelName);
      const updated = exists
        ? prev.configured_models.filter((m) => m.name !== modelName)
        : [...prev.configured_models, { name: modelName, context: 262144 }];
      return { ...prev, configured_models: updated };
    });
  };

  const handleContextChange = (modelName: string, context: number) => {
    setConfigForm((prev) => ({
      ...prev,
      configured_models: prev.configured_models.map((m) =>
        m.name === modelName ? { ...m, context } : m
      ),
    }));
  };

  const handleAddManualModel = () => {
    const name = manualModelName.trim();
    if (!name) return;
    setConfigForm((prev) => {
      if (prev.configured_models.find((m) => m.name === name)) return prev;
      return {
        ...prev,
        configured_models: [
          ...prev.configured_models,
          { name, context: Number(manualModelContext) || 262144 },
        ],
      };
    });
    setManualModelName('');
    setManualModelContext('');
  };

  const handleRemoveModel = (modelName: string) => {
    setConfigForm((prev) => ({
      ...prev,
      configured_models: prev.configured_models.filter((m) => m.name !== modelName),
    }));
  };

  const handleImportJson = () => {
    jsonInputRef.current?.click();
  };

  const handleJsonFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        const models = Array.isArray(data) ? data : data.models || data.configured_models || [];
        const parsed = models
          .filter((m: any) => m.name)
          .map((m: any) => ({ name: m.name, context: m.context || 262144 }));
        if (parsed.length === 0) {
          setModelsError('JSON 中未找到有效的模型配置');
          return;
        }
        setConfigForm((prev) => {
          const merged = [...prev.configured_models];
          for (const m of parsed) {
            if (!merged.find((x) => x.name === m.name)) {
              merged.push(m);
            }
          }
          return { ...prev, configured_models: merged };
        });
        setModelsInfo(`已导入 ${parsed.length} 个模型`);
      } catch {
        setModelsError('JSON 解析失败，请检查格式');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const submitConfig = async () => {
    if (!configTarget) return;
    setSubmitting(true);
    try {
      const extra: any = {};
      if (configForm.configured_models.length > 0) {
        extra.configured_models = configForm.configured_models;
      }
      await api.updatePlugin(configTarget.name, {
        base_url: configForm.base_url,
        api_key: configForm.api_key || undefined,
        embedding_model: configForm.embedding_model,
        extra_json: Object.keys(extra).length > 0 ? JSON.stringify(extra) : undefined,
      });
      await loadPlugins();
      flash('配置已保存');
      setConfigTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- 安装 / 激活 / 卸载 ----------
  const handleInstall = async (p: Plugin | ExtensionPlugin) => {
    try {
      if (p.category === 'model') {
        await api.installPlugin(p.name);
      } else {
        await api.installExtensionPlugin(p.name);
      }
      await loadPlugins();
      flash(`已安装 ${p.label}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '安装失败');
    }
  };

  const handleToggleActive = async (p: Plugin | ExtensionPlugin, isLlm: boolean) => {
    try {
      await api.updatePlugin(p.name, {
        is_active: isLlm ? !p.isActive : undefined,
        is_embedding_active: !isLlm ? ('isEmbeddingActive' in p ? !p.isEmbeddingActive : false) : undefined,
      });
      await loadPlugins();
      if (isLlm) {
        flash(p.isActive ? `已关闭 ${p.label} LLM` : `已开启 ${p.label} LLM`);
      } else if ('isEmbeddingActive' in p) {
        flash(p.isEmbeddingActive ? `已关闭 ${p.label} Embedding` : `已开启 ${p.label} Embedding`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  const handleExtensionAction = async (plugin: ExtensionPlugin, action: 'install' | 'activate' | 'deactivate' | 'delete') => {
    try {
      switch (action) {
        case 'install':
          await api.installExtensionPlugin(plugin.name);
          break;
        case 'activate':
          await api.activateExtensionPlugin(plugin.name);
          break;
        case 'deactivate':
          await api.deactivateExtensionPlugin(plugin.name);
          break;
        case 'delete':
          await api.deleteExtensionPlugin(plugin.name);
          break;
      }
      await loadPlugins();
    } catch (err: any) {
      setError(err.message || '操作失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.category === 'model') {
        await api.deletePlugin(deleteTarget.name);
      } else {
        await api.deleteExtensionPlugin(deleteTarget.name);
      }
      await loadPlugins();
      flash('插件已卸载');
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    }
  };

  // ---------- 上传 ----------
  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const result = await api.uploadPlugin(uploadFile, uploadType);
      await loadPlugins();
      if (result.error) {
        setError(`插件已保存，但加载失败：${result.error}`);
      } else {
        flash(`插件 ${result.name} 上传成功`);
      }
      setUploadOpen(false);
      setUploadFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  // ---------- URL 导入 ----------
  const handleImport = async () => {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const result = await api.importPlugin(url);
      await loadPlugins();
      if (result.error) {
        setError(`插件已保存，但加载失败：${result.error}`);
      } else {
        flash(`插件 ${result.name} 导入成功`);
      }
      setImportOpen(false);
      setImportUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : '导入失败');
    } finally {
      setImporting(false);
    }
  };

  if (!isAdmin) {
    return (
      <main className="flex flex-col items-center justify-center h-full bg-bg">
        <AlertCircle size={40} className="text-warning mb-3" />
        <p className="text-sm text-text-dim">需要管理员权限才能访问插件管理</p>
      </main>
    );
  }

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* 头部 */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <Puzzle size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">插件管理</h2>
          <span className="text-xs text-text-mute ml-2">{filtered.length} 个插件</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索插件..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-1.5"
          >
            <LinkIcon size={14} />
            URL 导入
          </Button>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="gap-1.5">
            <Upload size={14} />
            上传插件
          </Button>
        </div>
      </div>

      {/* 分类 Tab */}
      <div className="flex gap-2 px-6 py-3 border-b border-border shrink-0">
        {(['all', 'model', 'skill', 'extension', 'mcp_server'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setTabFilter(tab)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tabFilter === tab
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
              {tab === 'all' ? `全部 (${counts.all})` : 
tab === 'model' ? `模型 (${counts.model})` : 
tab === 'skill' ? `技能 (${counts.skill ?? 0})` : 
tab === 'mcp_server' ? `MCP Server (${counts.mcp_server ?? 0})` : 
`扩展 (${counts.extension ?? 0})`}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {info && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-success/10 text-success text-xs">
            <CheckCircle2 size={14} />
            <span>{info}</span>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-md bg-warning/10 text-warning text-xs">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-text-mute hover:text-text"
            >
              ✕
            </button>
          </div>
        )}
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载插件列表...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Puzzle size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的插件' : '暂无插件'}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-bg-2">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">插件</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">分类</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">来源</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">状态</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-dim">配置</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-text-dim">操作</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const cat = p.category || 'model';
                  return (
                    <tr
                      key={`plg-${p.name}`}
                      className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded bg-bg-3 border border-border inline-flex items-center justify-center text-text-dim shrink-0">
                            <Puzzle size={14} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-text font-medium">{p.label}</span>
                              {p.category === 'model' && p.isActive && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-accent/15 text-accent">
                                  <CheckCircle2 size={10} />
                                  当前 LLM
                                </span>
                              )}
                              {'isEmbeddingActive' in p && p.isEmbeddingActive && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-info/15 text-info">
                                  <CheckCircle2 size={10} />
                                  当前 Embedding
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-text-mute font-mono mt-0.5">
                              {p.name}
                            </div>
                            {p.category === 'skill' && (p as unknown as ExtensionPlugin).skillsJson && (
                              <div className="mt-1.5 space-y-0.5">
                                <p className="text-2xs font-medium text-text-dim">技能文件：</p>
                                {Object.entries(JSON.parse((p as unknown as ExtensionPlugin).skillsJson!)).map(([name, desc]) => {
                                  const descVal = typeof desc === 'object' ? desc as any : null;
                                  const kw: string[] = descVal?.keywords || [];
                                  const mm = descVal?.match_mode || 'keyword';
                                  return (
                                  <div key={name} className="flex items-center gap-1.5 text-2xs px-1.5 py-0.5 bg-muted/50 rounded">
                                    <span className="font-medium">{name}</span>
                                    {kw.length > 0 ? (
                                      <span className="text-text-mute truncate max-w-[200px]" title={kw.join(', ')}>
                                        触发: {kw.join(', ')}
                                      </span>
                                    ) : (
                                      <span className="text-text-mute">未设关键字</span>
                                    )}
                                    <span className={`px-1 rounded text-2xs ${mm === 'always' ? 'bg-accent/10 text-accent' : 'bg-bg-3 text-text-mute'}`}>
                                      {mm === 'always' ? '始终' : '关键字'}
                                    </span>
                                    {p.installed && p.isActive && (
                                      <button
                                        onClick={() => {
                                          setSkillConfig({
                                            pluginName: p.name,
                                            skillName: name,
                                            keywords: kw.join(', '),
                                            matchMode: mm,
                                          });
                                        }}
                                        className="text-accent hover:text-accent-hover ml-auto shrink-0"
                                      >
                                        配置
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                              </div>
                            )}
                            {p.category === 'extension' && (p as unknown as ExtensionPlugin).frontendJson && (
                              <div className="mt-1.5 space-y-0.5">
                                <p className="text-2xs font-medium text-text-dim">挂载点：</p>
                                {(() => {
                                  try {
                                    const frontend = JSON.parse((p as unknown as ExtensionPlugin).frontendJson!);
                                    return frontend.extension_points?.map((ep: string) => (
                                      <span key={ep} className="inline-block text-2xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded mr-1">{ep}</span>
                                    ));
                                  } catch { return null; }
                                })()}
                              </div>
                            )}
                            {p.category === 'mcp_server' && (
                              <div className="mt-1.5 flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${'isActive' in p && (p as any).isActive ? 'bg-green-500' : 'bg-text-mute'}`} />
                                <span className="text-2xs text-text-mute">
                                  {(p as any).isActive ? '已连接' : '未连接'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium ${
                            cat === 'model'
                              ? 'bg-info/15 text-info'
                              : 'bg-bg-3 text-text-dim border border-border'
                          }`}
                        >
                          {CATEGORY_LABEL[cat] ?? cat}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium ${
                            p.source === 'builtin'
                              ? 'bg-bg-3 text-text-dim border border-border'
                              : 'bg-accent/15 text-accent'
                          }`}
                        >
                          {p.source === 'builtin' ? '内置' : '上传'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {p.error ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-medium bg-error/15 text-error">
                            <AlertCircle size={10} />
                            错误
                          </span>
                        ) : p.installed ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-medium bg-success/15 text-success">
                            <PackageCheck size={10} />
                            已安装
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-2xs font-medium bg-bg-3 text-text-dim border border-border">
                            <Package size={10} />
                            未安装
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-2xs text-text-dim space-y-0.5">
                          {'baseUrl' in p && p.baseUrl ? (
                            <div className="font-mono truncate max-w-[220px]" title={p.baseUrl}>
                              {p.baseUrl}
                            </div>
                          ) : (
                            <div className="text-text-mute">未配置</div>
                          )}
                          <div className="flex items-center gap-2">
                            {'apiKeySet' in p && p.apiKeySet && <span className="text-success">key ✓</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.installed && !p.error && (
                            <>
                              {p.category === 'model' && (
                                <>
                                  <button
                                    className={`w-7 h-7 inline-flex items-center justify-center rounded text-xs transition-colors ${
                                      p.isActive
                                        ? 'bg-accent/15 text-accent hover:bg-accent/25'
                                        : 'bg-bg-3 text-text-mute hover:text-text hover:bg-bg-hover border border-border'
                                    }`}
                                    onClick={() => handleToggleActive(p, true)}
                                    title={p.isActive ? '关闭 LLM' : '开启 LLM'}
                                  >
                                    LLM
                                  </button>
                                  <button
                                    className={`w-7 h-7 inline-flex items-center justify-center rounded text-xs transition-colors ${
                                      'isEmbeddingActive' in p && p.isEmbeddingActive
                                        ? 'bg-info/15 text-info hover:bg-info/25'
                                        : 'bg-bg-3 text-text-mute hover:text-text hover:bg-bg-hover border border-border'
                                    }`}
                                    onClick={() => handleToggleActive(p, false)}
                                    title={'isEmbeddingActive' in p && p.isEmbeddingActive ? '关闭 Embedding' : '开启 Embedding'}
                                  >
                                    E
                                  </button>
                                </>
                              )}
                              {p.category !== 'model' && (
                                <button
                                  className={`w-7 h-7 inline-flex items-center justify-center rounded text-xs transition-colors ${
                                    (p as unknown as ExtensionPlugin).isActive
                                      ? 'bg-accent/15 text-accent hover:bg-accent/25'
                                      : 'bg-bg-3 text-text-mute hover:text-text hover:bg-bg-hover border border-border'
                                  }`}
                                  onClick={() => handleExtensionAction(p as unknown as ExtensionPlugin, (p as unknown as ExtensionPlugin).isActive ? 'deactivate' : 'activate')}
                                  title={(p as unknown as ExtensionPlugin).isActive ? '停用' : '激活'}
                                >
                                  <Power size={12} />
                                </button>
                              )}
                            </>
                          )}
                          {!p.installed && !p.error && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => handleInstall(p)}
                            >
                              <Package size={12} />
                              安装
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal size={14} />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              {p.category === 'model' && (
                                <DropdownMenuItem onClick={() => openConfig(p)}>
                                  <Settings size={14} />
                                  配置
                                </DropdownMenuItem>
                              )}
                              {p.category === 'model' && p.installed && !p.error && (
                                <DropdownMenuItem onClick={() => handleToggleActive(p, true)}>
                                  <Power size={14} />
                                  {p.isActive ? '关闭 LLM' : '开启 LLM'}
                                </DropdownMenuItem>
                              )}
                              {p.category === 'model' && p.installed && !p.error && (
                                <DropdownMenuItem onClick={() => handleToggleActive(p, false)}>
                                  <Power size={14} />
                                  {'isEmbeddingActive' in p && p.isEmbeddingActive ? '关闭 Embedding' : '开启 Embedding'}
                                </DropdownMenuItem>
                              )}
                              {p.category !== 'model' && !(p as unknown as ExtensionPlugin).installed && (
                                <DropdownMenuItem onClick={() => handleExtensionAction(p as unknown as ExtensionPlugin, 'install')}>
                                  <Package size={14} className="mr-2" />
                                  安装
                                </DropdownMenuItem>
                              )}
                              {p.category !== 'model' && (p as unknown as ExtensionPlugin).installed && (
                                <>
                                  <DropdownMenuItem onClick={() => handleExtensionAction(p as unknown as ExtensionPlugin, (p as unknown as ExtensionPlugin).isActive ? 'deactivate' : 'activate')}>
                                    <Power size={14} className="mr-2" />
                                    {(p as unknown as ExtensionPlugin).isActive ? '停用' : '激活'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(p)}
                                className="text-error focus:text-error"
                              >
                                <Trash2 size={14} />
                                {p.category === 'model' && p.source === 'uploaded' ? '卸载' : p.category !== 'model' ? '卸载' : '重置'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 配置弹窗 */}
      <Dialog
        open={!!configTarget}
        onOpenChange={(open) => !open && setConfigTarget(null)}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>配置 {configTarget?.label}</DialogTitle>
            <DialogDescription>
              设置该厂商的接入参数。安装并激活后会作为全局默认 provider。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="cfg-base-url">Base URL</Label>
              <Input
                id="cfg-base-url"
                value={configForm.base_url}
                onChange={(e) =>
                  setConfigForm({ ...configForm, base_url: e.target.value })
                }
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cfg-api-key">
                API Key{' '}
                {(configTarget as Plugin)?.apiKeySet && (
                  <span className="text-2xs text-text-mute ml-1">（留空表示不修改）</span>
                )}
              </Label>
              <Input
                id="cfg-api-key"
                type="password"
                value={configForm.api_key}
                onChange={(e) =>
                  setConfigForm({ ...configForm, api_key: e.target.value })
                }
                placeholder={(configTarget as Plugin)?.apiKeySet ? '已设置，留空保持不变' : 'sk-...'}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text">模型配置</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-2xs gap-1"
                    onClick={handleFetchModels}
                    disabled={modelsLoading || !configForm.base_url}
                    title={!configForm.base_url ? '请先填写 Base URL' : '从厂商拉取可用模型'}
                  >
                    {modelsLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <RefreshCw size={12} />
                    )}
                    拉取
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-2xs gap-1"
                    onClick={handleImportJson}
                  >
                    <FileJson size={12} />
                    JSON
                  </Button>
                  <input
                    ref={jsonInputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleJsonFileChange}
                  />
                </div>
              </div>

              {/* 拉取结果提示 */}
              {modelsInfo && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-success/10 text-success text-2xs">
                  <CheckCircle2 size={11} />
                  <span>{modelsInfo}</span>
                  <button
                    onClick={() => setModelsInfo(null)}
                    className="ml-auto text-success/70 hover:text-success"
                  >
                    ✕
                  </button>
                </div>
              )}
              {modelsError && (
                <div className="flex items-start gap-1.5 px-2 py-1.5 rounded bg-warning/10 text-warning text-2xs">
                  <AlertCircle size={11} className="shrink-0 mt-0.5" />
                  <span className="break-all">{modelsError}</span>
                  <button
                    onClick={() => setModelsError(null)}
                    className="ml-auto text-warning/70 hover:text-warning shrink-0"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* 已拉取的模型列表（多选 + 上下文） */}
              {modelsList.length > 0 && (
                <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1.5">
                  {modelsList.map((m) => {
                    const checked = configForm.configured_models.find((cm) => cm.name === m);
                    return (
                      <div key={m} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          onChange={() => handleToggleModel(m)}
                          className="rounded border-border shrink-0"
                        />
                        <span className="text-xs text-text flex-1 truncate">{m}</span>
                        {checked && (
                          <input
                            type="number"
                            value={checked.context}
                            onChange={(e) => handleContextChange(m, Number(e.target.value) || 262144)}
                            className="w-20 h-6 rounded border border-border bg-bg-2 px-1.5 text-2xs text-text text-right outline-none"
                            placeholder="上下文"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 手动添加 */}
              {(!modelsList.length || modelsError) && (
                <div className="flex items-center gap-2">
                  <Input
                    value={manualModelName}
                    onChange={(e) => setManualModelName(e.target.value)}
                    placeholder="模型名称"
                    className="h-7 text-xs flex-1"
                  />
                  <Input
                    type="number"
                    value={manualModelContext}
                    onChange={(e) => setManualModelContext(e.target.value)}
                    placeholder="上下文"
                    className="h-7 text-xs w-20"
                  />
                  <button
                    className="w-7 h-7 flex items-center justify-center rounded bg-accent text-white hover:bg-accent/80 disabled:opacity-40 shrink-0"
                    onClick={handleAddManualModel}
                    disabled={!manualModelName.trim()}
                  >
                    <Plus size={13} />
                  </button>
                </div>
              )}

              {/* 已配置的模型列表 */}
              {configForm.configured_models.length > 0 && (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {configForm.configured_models.map((m) => (
                    <div key={m.name} className="flex items-center gap-2 px-2.5 py-1.5">
                      <span className="text-xs text-text flex-1 truncate">{m.name}</span>
                      <span className="text-2xs text-text-mute shrink-0">{m.context.toLocaleString()}</span>
                      <button
                        className="w-5 h-5 flex items-center justify-center rounded text-text-mute hover:text-error hover:bg-error/10 transition-colors shrink-0"
                        onClick={() => handleRemoveModel(m.name)}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <div className="grid gap-2">
                  <Label htmlFor="cfg-emb">Embedding 模型</Label>
                  <Input
                    id="cfg-emb"
                    value={configForm.embedding_model}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, embedding_model: e.target.value })
                    }
                    placeholder="text-embedding-3-small"
                  />
                </div>
              </div>
            </div>
            {configTarget?.error && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-error/10 text-error text-2xs">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                <span className="font-mono">{configTarget.error}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfigTarget(null)}>
              取消
            </Button>
            <Button onClick={submitConfig} disabled={submitting}>
              {submitting && <Loader2 size={14} className="animate-spin" />}
              保存配置
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 技能关键字配置 */}
      <Dialog
        open={!!skillConfig}
        onOpenChange={(open) => !open && setSkillConfig(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>技能配置</DialogTitle>
            <DialogDescription>
              配置技能 {skillConfig?.skillName} 的触发关键字和匹配模式
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-1">
            <div className="space-y-1.5">
              <Label>匹配模式</Label>
              <select
                className="w-full h-9 rounded-md border border-border bg-bg px-3 text-sm outline-none focus:border-accent"
                value={skillConfig?.matchMode ?? 'keyword'}
                onChange={(e) =>
                  setSkillConfig((prev) => prev ? { ...prev, matchMode: e.target.value } : null)
                }
              >
                <option value="keyword">关键字匹配（子串匹配）</option>
                <option value="always">始终注入</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>关键字（逗号分隔）</Label>
              <Input
                placeholder="布局, 响应式, 设计"
                value={skillConfig?.keywords ?? ''}
                onChange={(e) =>
                  setSkillConfig((prev) => prev ? { ...prev, keywords: e.target.value } : null)
                }
              />
              <p className="text-2xs text-text-mute">用户消息中包含任意关键字时，此技能会自动注入到对话上下文</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSkillConfig(null)}>
              取消
            </Button>
            <Button onClick={async () => {
              if (!skillConfig) return;
              try {
                const kw = skillConfig.keywords.split(',').map((k) => k.trim()).filter(Boolean);
                await api.updateSkillKeywords(skillConfig.pluginName, {
                  name: skillConfig.skillName,
                  keywords: kw,
                  match_mode: skillConfig.matchMode,
                });
                setSkillConfig(null);
                setInfo(`技能 ${skillConfig.skillName} 配置已保存`);
                await loadPlugins();
              } catch (e) {
                setError(`配置失败：${e instanceof Error ? e.message : String(e)}`);
              }
            }}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除/重置确认 */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.source === 'uploaded' ? '确认卸载插件' : '确认重置插件'}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.source === 'uploaded' ? (
                <>
                  插件{' '}
                  <span className="text-text font-medium">{deleteTarget?.label}</span>{' '}
                  将被彻底删除（含已上传的文件），此操作不可恢复。
                </>
              ) : (
                <>
                  内置插件{' '}
                  <span className="text-text font-medium">{deleteTarget?.label}</span>{' '}
                  会被重置为未安装、未激活，且清空 API Key。
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              {deleteTarget?.source === 'uploaded' ? '卸载' : '重置'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 上传弹窗 */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) { setUploadFile(null); setUploadType('skill'); }
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>上传插件包</DialogTitle>
            <DialogDescription>
              选择 .zip 文件，包内必须包含 manifest.json 与对应的 Python 模块。
              上传后会自动尝试加载，失败信息会显示在列表中。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-dim">插件类型</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value)}
                className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none"
              >
                <option value="skill">Skill</option>
                <option value="mcp_server">MCP Server</option>
              </select>
            </div>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center px-4 py-8 rounded-lg border border-dashed border-border bg-bg-2 hover:bg-bg-3 cursor-pointer transition-colors"
            >
              <Upload size={24} className="text-text-mute mb-2" />
              <p className="text-sm text-text">
                {uploadFile ? uploadFile.name : '点击选择 .zip 文件'}
              </p>
              {uploadFile && (
                <p className="text-2xs text-text-mute mt-1">
                  {(uploadFile.size / 1024).toFixed(1)} KB
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <p className="text-2xs text-text-mute">
              注意：当前实现不会自动 pip install 依赖。若插件依赖第三方库，请管理员先在服务器上手动安装。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setUploadOpen(false);
                setUploadFile(null);
              }}
            >
              取消
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading && <Loader2 size={14} className="animate-spin" />}
              上传
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* URL 导入弹窗 */}
      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportUrl('');
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>从 URL 导入插件</DialogTitle>
            <DialogDescription>
              粘贴一个 .zip 包的 http/https 直链，后端会下载（最大 32MB）后走与上传相同的安装流程。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-2">
              <Label htmlFor="import-url">插件 zip URL</Label>
              <Input
                id="import-url"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://example.com/my_plugin-0.1.0.zip"
              />
            </div>
            <p className="text-2xs text-text-mute">
              仅支持 http(s) 协议；URL 路径必须以 .zip 结尾；超过 32MB 的包会被拒绝。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportUrl('');
              }}
            >
              取消
            </Button>
            <Button onClick={handleImport} disabled={!importUrl.trim() || importing}>
              {importing && <Loader2 size={14} className="animate-spin" />}
              导入
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
