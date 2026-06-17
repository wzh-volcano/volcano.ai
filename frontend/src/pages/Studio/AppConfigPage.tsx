import React, { useState, useEffect, useRef } from 'react';
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  FileText,
  Save,
  Trash2,
  LayoutGrid,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileDown,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';


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
  const [kbIds, setKbIds] = useState<number[]>([]);
  const [apiEnabled, setApiEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [apiDocsOpen, setApiDocsOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversation_id');
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const resetConversations = useConversationStore((s) => s.reset);

  // Provider/Model dropdown data
  const [activeProviders, setActiveProviders] = useState<{ provider_name: string; label: string; models: { name: string; context: number }[] }[]>([]);
  const [availableModels, setAvailableModels] = useState<{ name: string; context: number }[]>([]);

  const activeModel = availableModels.find((m) => m.name === model);
  const maxTokens = activeModel?.context ?? 128000;

  // KBs
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
        setKbIds(config.kb_ids || []);
        setApiEnabled(app.apiEnabled ?? false);
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

  // Fetch KBs
  useEffect(() => {
    (async () => {
      try {
        const { api } = await import('@/lib/api');
        const kbs = await api.listKbs();
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
      const configJson = JSON.stringify({ model, provider, prompt, kb_ids: kbIds });
      await updateApp(app.id, { name, icon, description, config_json: configJson, api_enabled: apiEnabled });
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

  const handleDownloadDocs = () => {
    const content = buildApiDocs();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${app?.name ?? 'api'}-docs.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const buildApiDocs = () => {
    const origin = window.location.origin;
    const appId = app?.id ?? '{app_id}';
    return `# API 使用文档

使用 API Key 通过 HTTP 接口访问此应用的对话能力。

## 认证方式

所有请求需在 Header 中携带 API Key：

\`\`\`
X-API-Key: vol_your_api_key_here
\`\`\`

## 1. 创建会话

创建一个新的对话，返回会话 ID。

\`\`\`
POST /api/public/apps/{app_id}/conversations

请求体：
  {"title": "可选会话标题"}

响应：
  {"id": 1, "title": "...", "created_at": "..."}

示例：
  curl -X POST ${origin}/api/public/apps/${appId}/conversations \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"title": "我的会话"}'
\`\`\`

## 2. 发送消息（需传入上下文）

向指定会话发送消息，需在请求体中传入历史消息数组，以 SSE 流式返回模型回答。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/chat

请求体：
  {
    "question": "用户消息",
    "messages": [   ← 可选，用于多轮上下文
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }

响应（SSE）：
  data: {"token": "回答"}
  data: {"token": "内容"}
  data: {"done": true}

示例：
  curl -N -X POST ${origin}/api/public/apps/${appId}/conversations/1/chat \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"question": "你好"}'
\`\`\`

## 3. 发送消息（自动检索上下文）

仅传入最新消息，后端自动从数据库拉取完整上下文，流式返回回答。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/simple-chat

请求体：
  {
    "question": "用户消息"
  }

响应（SSE）：
  data: {"token": "回答"}
  data: {"token": "内容"}
  data: {"done": true}

示例：
  curl -N -X POST ${origin}/api/public/apps/${appId}/conversations/1/simple-chat \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"question": "你好"}'
\`\`\`

## 4. 获取消息列表

获取指定会话的所有消息记录。

\`\`\`
GET /api/public/apps/{app_id}/conversations/{conv_id}/messages

响应：
  [
    {"role": "user", "content": "你好", "token_count": 0, "created_at": "..."},
    {"role": "assistant", "content": "你好！", "token_count": 0, "created_at": "..."}
  ]

示例：
  curl ${origin}/api/public/apps/${appId}/conversations/1/messages \\
    -H "X-API-Key: vol_xxx"
\`\`\`

## 5. 删除会话

删除指定会话及其所有消息。

\`\`\`
DELETE /api/public/apps/{app_id}/conversations/{conv_id}

响应：204 No Content

示例：
  curl -X DELETE ${origin}/api/public/apps/${appId}/conversations/1 \\
    -H "X-API-Key: vol_xxx"
\`\`\`

## 6. 压缩上下文

使用应用的 LLM 将会话全部历史消息压缩为摘要并保存。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/compress

响应：
  {"summary": "用户询问了...助手回答了..."}

示例：
  curl -X POST ${origin}/api/public/apps/${appId}/conversations/1/compress \\
    -H "X-API-Key: vol_xxx"
\`\`\`
`;
  };

  const ApiPreBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const preRef = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);
    const handleCopy = async () => {
      if (!preRef.current) return;
      await navigator.clipboard.writeText(preRef.current.textContent || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    return (
      <div className="relative group/pre my-2">
        <pre ref={preRef} className="bg-bg-3 border border-border rounded-lg p-3 overflow-x-auto text-xs leading-relaxed !mt-0 !mb-0">
          {children}
        </pre>
        <div className="absolute top-2 right-2 opacity-0 group-hover/pre:opacity-100 transition-opacity flex gap-1">
          <button
            className="w-6 h-6 flex items-center justify-center rounded bg-bg-2 border border-border text-text-mute hover:text-text"
            onClick={handleCopy}
            title="复制"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
    );
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
          {apiEnabled && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setApiDocsOpen(true)}>
              <FileText size={13} />
              API 文档
            </Button>
          )}
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

            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-text">Open API</h3>
                <p className="text-xs text-text-dim mt-0.5">开启后可通过 API Key 访问此应用的对话接口</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={apiEnabled}
                  onChange={(e) => setApiEnabled(e.target.checked)}
                />
                <div className="w-9 h-5 bg-bg-3 rounded-full peer peer-checked:bg-accent after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
              </label>
            </div>
          </div>
        </div>

        {/* Right panel */}
        {showPreview && (
          <div className="flex-1 border-l border-border flex flex-col min-w-0 animate-in slide-in-from-right">
            <StudioChatPreview
              appId={app.id}
              config={{ model, provider, prompt, kb_ids: kbIds, maxTokens }}
              conversationId={conversationId ? Number(conversationId) : undefined}
            />
          </div>
        )}
      </div>

      {/* API 文档弹窗 */}
      <Dialog open={apiDocsOpen} onOpenChange={setApiDocsOpen}>
        <DialogContent className="sm:max-w-[640px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <div>
                <DialogTitle>API 使用文档</DialogTitle>
                <DialogDescription>使用 API Key 通过 HTTP 接口访问此应用的对话能力</DialogDescription>
              </div>
              <button
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-bg-hover text-text-mute hover:text-text transition-colors"
                onClick={handleDownloadDocs}
                title="下载 Markdown"
              >
                <FileDown size={14} />
              </button>
            </div>
          </DialogHeader>
          <div className="py-2 text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{ pre: ({ children }) => <ApiPreBlock>{children}</ApiPreBlock> }}
            >
              {`## 认证方式

所有请求需在 Header 中携带 API Key：

\`\`\`
X-API-Key: vol_your_api_key_here
\`\`\`

## 1. 创建会话

创建一个新的对话，返回会话 ID。

\`\`\`
POST /api/public/apps/{app_id}/conversations

请求体：
  {"title": "可选会话标题"}

响应：
  {"id": 1, "title": "...", "created_at": "..."}

示例：
  curl -X POST ${window.location.origin}/api/public/apps/${app?.id}/conversations \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"title": "我的会话"}'
\`\`\`

## 2. 发送消息（需传入上下文）

向指定会话发送消息，需在请求体中传入历史消息数组，以 SSE 流式返回模型回答。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/chat

请求体：
  {
    "question": "用户消息",
    "messages": [   ← 可选，用于多轮上下文
      {"role": "user", "content": "..."},
      {"role": "assistant", "content": "..."}
    ]
  }

响应（SSE）：
  data: {"token": "回答"}
  data: {"token": "内容"}
  data: {"done": true}

示例：
  curl -N -X POST ${window.location.origin}/api/public/apps/${app?.id}/conversations/1/chat \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"question": "你好"}'
\`\`\`

## 3. 发送消息（自动检索上下文）

仅传入最新消息，后端自动从数据库拉取完整上下文，流式返回回答。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/simple-chat

请求体：
  {
    "question": "用户消息"
  }

响应（SSE）：
  data: {"token": "回答"}
  data: {"token": "内容"}
  data: {"done": true}

示例：
  curl -N -X POST ${window.location.origin}/api/public/apps/${app?.id}/conversations/1/simple-chat \\
    -H "X-API-Key: vol_xxx" \\
    -H "Content-Type: application/json" \\
    -d '{"question": "你好"}'
\`\`\`

## 4. 获取消息列表

获取指定会话的所有消息记录。

\`\`\`
GET /api/public/apps/{app_id}/conversations/{conv_id}/messages

响应：
  [
    {"role": "user", "content": "你好", "token_count": 0, "created_at": "..."},
    {"role": "assistant", "content": "你好！", "token_count": 0, "created_at": "..."}
  ]

示例：
  curl ${window.location.origin}/api/public/apps/${app?.id}/conversations/1/messages \\
    -H "X-API-Key: vol_xxx"
\`\`\`

## 5. 删除会话

删除指定会话及其所有消息。

\`\`\`
DELETE /api/public/apps/{app_id}/conversations/{conv_id}

响应：204 No Content

示例：
  curl -X DELETE ${window.location.origin}/api/public/apps/${app?.id}/conversations/1 \\
    -H "X-API-Key: vol_xxx"
\`\`\`

## 6. 压缩上下文

使用应用的 LLM 将会话全部历史消息压缩为摘要并保存。

\`\`\`
POST /api/public/apps/{app_id}/conversations/{conv_id}/compress

响应：
  {"summary": "用户询问了...助手回答了..."}

示例：
  curl -X POST ${window.location.origin}/api/public/apps/${app?.id}/conversations/1/compress \\
    -H "X-API-Key: vol_xxx"
\`\`\``}
            </ReactMarkdown>
          </div>
        </DialogContent>
      </Dialog>

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
