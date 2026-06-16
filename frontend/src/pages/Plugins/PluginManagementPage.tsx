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
} from 'lucide-react';
import type { Plugin } from '@/types';

interface ConfigFormState {
  base_url: string;
  api_key: string;
  llm_model: string;
  embedding_model: string;
}

const EMPTY_FORM: ConfigFormState = {
  base_url: '',
  api_key: '',
  llm_model: '',
  embedding_model: '',
};

type CategoryFilter = 'all' | 'model' | 'other';

const CATEGORY_LABEL: Record<string, string> = {
  model: '模型',
  other: '其它',
};

export const PluginManagementPage: React.FC = () => {
  const currentUser = useAuthStore((s) => s.currentUser);

  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [configTarget, setConfigTarget] = useState<Plugin | null>(null);
  const [configForm, setConfigForm] = useState<ConfigFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  // 配置弹窗：从厂商拉取的模型列表（供 LLM/Embedding 下拉建议）
  const [modelsList, setModelsList] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsInfo, setModelsInfo] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Plugin | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const isAdmin = currentUser?.role === 'admin';

  const loadPlugins = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listPlugins();
      setPlugins(data);
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
    const byCat: Record<string, number> = { model: 0, other: 0 };
    for (const p of plugins) {
      const c = p.category || 'model';
      byCat[c] = (byCat[c] ?? 0) + 1;
    }
    return { all: plugins.length, model: byCat.model ?? 0, other: byCat.other ?? 0 };
  }, [plugins]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plugins.filter((p) => {
      const cat = p.category || 'model';
      if (categoryFilter !== 'all' && cat !== categoryFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.label.toLowerCase().includes(q);
    });
  }, [plugins, query, categoryFilter]);

  const flash = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo(null), 2500);
  };

  // ---------- 配置 ----------
  const openConfig = (p: Plugin) => {
    setConfigTarget(p);
    setConfigForm({
      base_url: p.baseUrl,
      api_key: '',
      llm_model: p.llmModel,
      embedding_model: p.embeddingModel,
    });
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
      // 表单当前值优先；api_key 留空时后端回退到 DB 已存值
      const models = await api.fetchPluginModels(configTarget.name, {
        base_url: configForm.base_url || undefined,
        api_key: configForm.api_key || undefined,
      });
      setModelsList(models);
      if (models.length === 0) {
        setModelsInfo('该厂商未返回任何模型，请手动填写');
      } else {
        setModelsInfo(`已获取 ${models.length} 个模型，可在下方下拉选择`);
      }
    } catch (e) {
      setModelsError(e instanceof Error ? e.message : '拉取失败');
    } finally {
      setModelsLoading(false);
    }
  };

  const submitConfig = async () => {
    if (!configTarget) return;
    setSubmitting(true);
    try {
      await api.updatePlugin(configTarget.name, {
        base_url: configForm.base_url,
        api_key: configForm.api_key || undefined,
        llm_model: configForm.llm_model,
        embedding_model: configForm.embedding_model,
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
  const handleInstall = async (p: Plugin) => {
    try {
      await api.installPlugin(p.name);
      await loadPlugins();
      flash(`已安装 ${p.label}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '安装失败');
    }
  };

  const handleActivate = async (p: Plugin) => {
    try {
      await api.activatePlugin(p.name);
      await loadPlugins();
      flash(`${p.label} 已设为当前生效厂商`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '激活失败');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deletePlugin(deleteTarget.name);
      await loadPlugins();
      flash(deleteTarget.source === 'uploaded' ? '插件已卸载' : '插件已重置');
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
      const result = await api.uploadPlugin(uploadFile);
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

      {/* 分类筛选 */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0">
        <span className="text-2xs text-text-mute mr-1">分类：</span>
        {(
          [
            { key: 'all', label: `全部 (${counts.all})` },
            { key: 'model', label: `模型 (${counts.model})` },
            { key: 'other', label: `其它 (${counts.other})` },
          ] as { key: CategoryFilter; label: string }[]
        ).map((opt) => (
          <button
            key={opt.key}
            onClick={() => setCategoryFilter(opt.key)}
            className={`px-2.5 py-1 rounded-full text-2xs transition-colors ${
              categoryFilter === opt.key
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-2 text-text-dim border border-border hover:bg-bg-3'
            }`}
          >
            {opt.label}
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
                      key={p.id}
                      className="border-b border-border last:border-b-0 hover:bg-bg-hover transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded bg-bg-3 border border-border inline-flex items-center justify-center text-text-dim shrink-0">
                            <Puzzle size={14} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-text font-medium">{p.label}</span>
                              {p.isActive && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium bg-accent/15 text-accent">
                                  <CheckCircle2 size={10} />
                                  当前生效
                                </span>
                              )}
                            </div>
                            <div className="text-2xs text-text-mute font-mono mt-0.5">
                              {p.name}
                            </div>
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
                          {p.baseUrl ? (
                            <div className="font-mono truncate max-w-[220px]" title={p.baseUrl}>
                              {p.baseUrl}
                            </div>
                          ) : (
                            <div className="text-text-mute">未配置</div>
                          )}
                          <div className="flex items-center gap-2">
                            {p.apiKeySet && <span className="text-success">key ✓</span>}
                            {p.llmModel && <span className="text-text-mute">{p.llmModel}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {!p.isActive && p.installed && !p.error && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs gap-1"
                              onClick={() => handleActivate(p)}
                            >
                              <Power size={12} />
                              激活
                            </Button>
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
                              <DropdownMenuItem onClick={() => openConfig(p)}>
                                <Settings size={14} />
                                配置
                              </DropdownMenuItem>
                              {!p.isActive && p.installed && !p.error && (
                                <DropdownMenuItem onClick={() => handleActivate(p)}>
                                  <Power size={14} />
                                  激活
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(p)}
                                className="text-error focus:text-error"
                              >
                                <Trash2 size={14} />
                                {p.source === 'uploaded' ? '卸载' : '重置'}
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
                {configTarget?.apiKeySet && (
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
                placeholder={configTarget?.apiKeySet ? '已设置，留空保持不变' : 'sk-...'}
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-2xs text-text-mute">模型选择</span>
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
                  拉取模型列表
                </Button>
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
              {/* datalist：两个输入框共用一份候选；仍可手动输入 */}
              <datalist id="cfg-model-options">
                {modelsList.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="cfg-llm">LLM 模型</Label>
                  <Input
                    id="cfg-llm"
                    list="cfg-model-options"
                    value={configForm.llm_model}
                    onChange={(e) =>
                      setConfigForm({ ...configForm, llm_model: e.target.value })
                    }
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cfg-emb">Embedding 模型</Label>
                  <Input
                    id="cfg-emb"
                    list="cfg-model-options"
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
          if (!open) setUploadFile(null);
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
