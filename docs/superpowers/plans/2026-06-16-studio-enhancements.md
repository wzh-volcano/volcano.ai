# Studio Module Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Studio module with multi-LLM support, skill/KB association UI, SSE streaming, and Markdown rendering.

**Architecture:** Backend changes to plugin activation (allow multiple active providers), new `active-models` endpoint, per-app provider selection in chat, SSE streaming. Frontend cascading provider/model dropdowns, multi-select skill/KB pickers, streaming consumption, react-markdown rendering.

**Tech Stack:** FastAPI + SSE, React 18 + react-markdown + remark-gfm + rehype-highlight

---

### Task 1: Backend — Active Models Schema, Registry, and Endpoint

**Files:**
- Modify: `backend/app/schemas.py` (add ActiveModelOut)
- Modify: `backend/app/providers/registry.py` (add list_active_models)
- Modify: `backend/app/routers/plugins.py` (remove activate mutual exclusion, add active-models endpoint)

- [ ] **Step 1: Add ActiveModelOut schema**

Add after `PluginModelsResponse` in `backend/app/schemas.py`:

```python
class ActiveModelOut(BaseModel):
    provider_name: str
    label: str
    models: list[str]
```

- [ ] **Step 2: Add list_active_models to registry**

Add after `get_current_legacy` in `backend/app/providers/registry.py`:

```python
def list_active_models(db: Session) -> list[dict]:
    """返回所有已安装已激活的 provider 及其可用模型列表。"""
    from ..models import ProviderConfig

    rows = db.scalars(
        select(ProviderConfig).where(
            ProviderConfig.installed.is_(True),
            ProviderConfig.is_active.is_(True),
            ProviderConfig.error.is_(None),
        )
    ).all()

    result: list[dict] = []
    for row in rows:
        models: list[str] = []
        try:
            provider = _instantiate_from_row(row)
            if hasattr(provider, "list_models"):
                models = provider.list_models()
        except Exception:
            pass
        if not models and row.llm_model:
            models = [row.llm_model]
        result.append({
            "provider_name": row.name,
            "label": row.label,
            "models": models,
        })
    return result
```

- [ ] **Step 3: Remove mutual exclusion in activate_plugin**

In `backend/app/routers/plugins.py`, find the `activate_plugin` function and remove the line:
```python
    db.execute(update(ProviderConfig).values(is_active=False))
```

The function should become:
```python
@router.post("/{name}/activate", response_model=schemas.PluginOut)
def activate_plugin(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginOut:
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if not row.installed:
        raise HTTPException(status_code=400, detail="请先安装插件后再激活")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件存在错误：{row.error}")

    row.is_active = True
    db.commit()
    db.refresh(row)
    return _to_out(row)
```

Also remove the `update` import if it becomes unused:
- Check if `update` from `sqlalchemy` is used elsewhere in the file. If only in activate_plugin, remove it from the import.

- [ ] **Step 4: Add active-models endpoint**

In `backend/app/routers/plugins.py`, add before the `delete_plugin` endpoint:

```python
@router.get("/active-models", response_model=list[schemas.ActiveModelOut])
def list_active_models_endpoint(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[schemas.ActiveModelOut]:
    """返回所有已安装已激活 provider 的模型列表。供 Studio 配置页用。"""
    from ..providers.registry import list_active_models

    return [schemas.ActiveModelOut(**m) for m in list_active_models(db)]
```

- [ ] **Step 5: Verify backend builds**

Run: `cd backend && python -c "from app.schemas import ActiveModelOut; from app.routers.plugins import router; print('OK')"`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas.py backend/app/providers/registry.py backend/app/routers/plugins.py
git commit -m "feat: add active-models endpoint, allow multiple active providers"
```

---

### Task 2: Backend — Chat Endpoint with Per-App Provider and SSE Streaming

**Files:**
- Modify: `backend/app/routers/apps.py` (use per-app provider, SSE streaming)
- Modify: `backend/app/schemas.py` (already has AppChatRequest, add ActiveModelOut was done in Task 1)

- [ ] **Step 1: Modify chat endpoint to use per-app provider**

In `backend/app/routers/apps.py`, replace the try block in `chat_with_app`:

Replace:
```python
    try:
        provider = get_current(db)
        llm = provider.get_llm()
        prompt = ChatPromptTemplate.from_messages([
            ("system", "{system}"),
            ("human", "{question}"),
        ])
        chain = prompt | llm | StrOutputParser()
        answer = chain.invoke({"system": full_prompt, "question": payload.question})
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")
```

With:
```python
    # 获取 provider
    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)  # fallback 全局

    llm = provider.get_llm()
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system}"),
        ("human", "{question}"),
    ])

    # 技能拼接（插入在 system prompt 之前）
    skill_ids = config.get("skill_ids", [])
    for sid in skill_ids:
        skill = db.get(Skill, sid)
        if skill and (current_user.role == "admin" or skill.owner_id == current_user.id):
            full_prompt = skill.content + "\n\n" + full_prompt

    # 检查是否流式
    stream = payload.stream or False

    if stream:
        from fastapi.responses import StreamingResponse

        async def event_stream():
            chain = prompt | llm | StrOutputParser()
            try:
                async for chunk in chain.astream_events({"system": full_prompt, "question": payload.question}, version="v1"):
                    if chunk["event"] == "on_parser_stream":
                        token = chunk["data"]["chunk"]
                        yield f"data: {json.dumps({'token': token})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: {\"done\": true}\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    else:
        chain = prompt | llm | StrOutputParser()
        try:
            answer = chain.invoke({"system": full_prompt, "question": payload.question})
            return {"answer": answer}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")
```

Add imports at the top:
```python
from ..providers import get_current, get_provider
from ..models import App, KnowledgeBase, Skill, User
```

Remove unused imports if any. Add `Skill` to the models import.

Also update `AppChatRequest` in schemas.py to add optional `stream` field:
```python
class AppChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    stream: bool = False
```

- [ ] **Step 2: Verify build**

Run: `cd backend && python -c "from app.routers.apps import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/apps.py backend/app/schemas.py
git commit -m "feat: per-app provider selection, SSE streaming, skill injection"
```

---

### Task 3: Frontend — API Methods and Markdown Dependencies

**Files:**
- Modify: `frontend/src/lib/api.ts` (add fetchActiveModels, update ChatAppResponse)
- Modify: `frontend/package.json` (add react-markdown + plugins)

- [ ] **Step 1: Add fetchActiveModels to api.ts**

Add before or after `chatWithApp` in `frontend/src/lib/api.ts`:

```typescript
  /** 获取已安装已激活 provider 的模型列表 */
  fetchActiveModels: async (): Promise<{ provider_name: string; label: string; models: string[] }[]> => {
    return request<{ provider_name: string; label: string; models: string[] }[]>('/api/plugins/active-models');
  },
```

Update `ChatAppResponse` to include stream field:
```typescript
export interface ChatAppResponse {
  answer: string;
}
```
(no change needed — the non-stream response stays the same)

- [ ] **Step 2: Add markdown dependencies**

Read `frontend/package.json` and add to `dependencies`:

```json
    "react-markdown": "^9.0.1",
    "remark-gfm": "^4.0.0",
    "rehype-highlight": "^7.0.0"
```

- [ ] **Step 3: Install dependencies**

Run: `cd frontend && npm install`
Expected: Packages install successfully

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/package.json frontend/package-lock.json
git commit -m "feat: add fetchActiveModels API, add markdown dependencies"
```

---

### Task 4: Frontend — AppConfigPage Provider/Model Dropdown + Skills/KB Multi-Select

**Files:**
- Modify: `frontend/src/pages/Studio/AppConfigPage.tsx` (replace Input with Select, add multi-select sections)

- [ ] **Step 1: Read current AppConfigPage**

Read `frontend/src/pages/Studio/AppConfigPage.tsx` to understand current structure.

- [ ] **Step 2: Add state and data loading for providers, skills, KBs**

Add new state variables:

```typescript
  // Provider/Model dropdown data
  const [activeProviders, setActiveProviders] = useState<{ provider_name: string; label: string; models: string[] }[]>([]);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Skills & KBs
  const [availableSkills, setAvailableSkills] = useState<{ id: number; name: string }[]>([]);
  const [availableKbs, setAvailableKbs] = useState<{ id: number; name: string }[]>([]);

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
    // 如果当前 model 不在列表中，清空
    if (p && !p.models.includes(model)) {
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
```

- [ ] **Step 3: Replace provider/model Inputs with Select dropdowns**

Replace the model config section:

```typescript
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
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
```

- [ ] **Step 4: Replace skills and KB placeholder sections**

Replace the skills placeholder:
```typescript
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
```

Replace the KB placeholder:
```typescript
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
```

- [ ] **Step 5: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Studio/AppConfigPage.tsx
git commit -m "feat: add provider/model dropdown, skill/KB multi-select in app config"
```

---

### Task 5: Frontend — StudioChatPreview Streaming + Markdown Rendering

**Files:**
- Modify: `frontend/src/pages/Studio/StudioChatPreview.tsx` (streaming consumption, markdown rendering)

- [ ] **Step 1: Update StudioChatPreview**

Replace the content of `frontend/src/pages/Studio/StudioChatPreview.tsx`:

```typescript
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  appId: number;
  config: {
    model: string;
    provider: string;
    prompt: string;
    skill_ids: number[];
    kb_ids: number[];
  };
}

export const StudioChatPreview: React.FC<Props> = ({ appId, config }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: '你好！我是聊天助手，有什么可以帮助你的？' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSend = useCallback(async () => {
    const q = input.trim();
    if (!q || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setSending(true);
    setError('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('volcano_token');
      const response = await fetch(`/api/apps/${appId}/chat?stream=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ question: q }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Add empty assistant message to append tokens to
      const assistantIdx = messages.length + 1; // +1 for the user msg just added
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          try {
            const parsed = JSON.parse(data);
            if (parsed.done) break;
            if (parsed.token) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + parsed.token };
                }
                return next;
              });
            }
            if (parsed.error) {
              setError(parsed.error);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e instanceof Error ? e.message : '请求失败');
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [input, sending, appId, messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-2.5 border-b border-border text-xs font-medium text-text-dim flex items-center gap-2">
        <span>预览 & 测试</span>
        <span className="text-2xs text-text-mute">
          ({config.model || '未选择模型'})
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed prose prose-invert prose-xs ${
              msg.role === 'user'
                ? 'bg-accent text-white rounded-br-md'
                : 'bg-bg-2 border border-border text-text rounded-bl-md'
            }`}>
              {msg.role === 'user' ? (
                msg.content
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.content || '…'}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}
        {error && (
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
            <span>{error}</span>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-border">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="输入测试消息..."
            className="h-8 text-xs"
            disabled={sending}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={sending || !input.trim()}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Studio/StudioChatPreview.tsx
git commit -m "feat: add SSE streaming and markdown rendering in chat preview"
```
