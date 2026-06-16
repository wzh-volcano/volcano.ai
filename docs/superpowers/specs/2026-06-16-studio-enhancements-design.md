# 工作室模块增强设计

> 基于已实现的 Studio Module，扩充：多 LLM 支持、技能配置、知识库关联、流式输出与 Markdown 渲染。

## 1. 多 LLM Provider 支持

### 后端改动

**解除单活跃限制**

修改 `backend/app/routers/plugins.py` 中 `activate_plugin`：移除 `db.execute(update(ProviderConfig).values(is_active=False))`，直接设置目标行的 `is_active=True`。允许多个 provider 同时为激活状态，`is_active` 语义改为「已配置可供应用选用」。

**新增端点：`GET /api/plugins/active-models`**

响应格式：
```json
[
  {
    "provider_name": "openai_like",
    "label": "OpenAI 兼容",
    "models": ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"]
  }
]
```

实现逻辑：查询 `ProviderConfig` 表中 `installed=True` 且 `is_active=True` 的行，无错误。对每个 provider 尝试调用 `list_models()`；若未实现则回退到返回 `[llm_model]`（DB 中配置的单个模型名）。

**App Chat 端点改造**

`backend/app/routers/apps.py` 中 `chat_with_app`：从 `config_json.provider` 读取 provider name，调用 `get_provider(db, config_json["provider"])` 获取对应 LLM 实例。不再依赖全局 `get_current(db)`。

### 前端改动

**AppConfigPage 模型区**

Provider（Select 下拉）→ Model（Select 下拉，跟随 provider 变化）。数据源：`GET /api/plugins/active-models`。

```
Provider: [openai_like ▼]
Model:    [gpt-4o-mini ▼]
```

若 active-models 为空，显示提示文字「请先到插件管理页面配置并安装至少一个 LLM 插件」。

新增 API 方法：
```typescript
fetchActiveModels: () => Promise<{ provider_name: string; label: string; models: string[] }[]>
```

## 2. 技能配置

### 后端

无新增端点（复用 `GET /api/skills`）。Chat 运行时在 `chat_with_app` 中读取 `config_json.skill_ids`，加载对应技能，将其 `content` 插入 system prompt 之前：

```
prompt = skill.content + "\n\n" + user_custom_prompt + "\n\n" + kb_context
```

### 前端

AppConfigPage 技能区：加载时调 `GET /api/skills`，渲染为多选列表（checkbox 列表或 shadcn Command 多选）。选中项的 id 存入 `config_json.skill_ids`。支持搜索过滤。

## 3. 关联知识库

### 后端

无新增端点（复用 `GET /api/kb`）。Chat 沿用现有 RAG 检索逻辑，`kb_ids` 从 `config_json.kb_ids` 读取。

### 前端

AppConfigPage KB 区：加载时调 `GET /api/kb`，渲染为多选列表（与技能区 UI 一致）。选中项的 id 存入 `config_json.kb_ids`。支持搜索过滤。

## 4. 流式输出 & Markdown 渲染

### 后端 SSE

`POST /api/apps/:id/chat` 新增 `stream` 查询参数（`?stream=true`）：

- `stream=false` 或不传 → 返回原有 JSON `{"answer": "..."}`（向后兼容）
- `stream=true` → 返回 `text/event-stream`

SSE 格式：
```
data: {"token": "你好"}
data: {"token": "，"}
data: {"token": "世界"}
data: {"done": true}
```

实现：LLM 的 `stream()` 方法逐 token yield。前端关闭连接后停止生成。

### 前端 Streaming

**StudioChatPreview.tsx**：`handleSend` 判断是否使用 stream 模式：
- 不使用 → 走原有 `api.chatWithApp()` JSON 响应
- 使用 → 用 `fetch()` 请求流式端点，通过 `response.body!.getReader()` 逐 token 读取 SSE 事件，直接追加到当前 assistant 消息中（实时展示）

流式发送时输入框保持 disabled，但已收到的 tokens 实时渲染。

### 前端 Markdown

安装依赖：`react-markdown`、`remark-gfm`、`rehype-highlight`

聊天消息中 assistant 角色的 content 通过 `<ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>` 渲染。用户消息保持纯文本。

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `backend/app/routers/plugins.py` | 解除 activate 互斥 |
| `backend/app/routers/apps.py` | chat 用 provider 名实例化 LLM + SSE 流式输出 |
| `backend/app/schemas.py` | 新增 ActiveModelOut |
| `backend/app/providers/registry.py` | 新增 list_active_models() |
| `frontend/src/pages/Studio/AppConfigPage.tsx` | Provider/Model 改为 Select 下拉；技能/KB 多选区 |
| `frontend/src/pages/Studio/StudioChatPreview.tsx` | 流式消费 + Markdown 渲染 |
| `frontend/src/lib/api.ts` | 新增 fetchActiveModels |
| `frontend/package.json` | 新增 react-markdown / remark-gfm / rehype-highlight |

## 向后兼容

- 所有现有 api/apps 端点保持不变
- 非流式 chat 调用保持原有 JSON 响应格式
- 已有的 provider activate 行为不变（仅不再互斥）
- 旧 app 的 config_json 不包含 provider/model 时，chat 端点仍 fallback 到 `get_current(db)`
