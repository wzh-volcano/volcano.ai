# 工作室模块设计文档

## 概述

为 Transformer AI 平台新增「工作室」模块，用户可以创建和管理 AI 聊天助手应用。每个应用包含独立的模型配置、技能、知识库关联和提示词，并可在配置页面即时测试。

## 数据模型

### `apps` 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | int, PK, auto | 主键 |
| name | varchar(128), not null | 应用名称 |
| icon | varchar(32), default "🤖" | 应用图标（lucide 图标名） |
| description | text, default "" | 应用介绍 |
| type | varchar(32), default "chat_assistant" | 应用类型，后续扩展 |
| category | varchar(32), default "chat_assistant" | 分类 |
| status | varchar(16), default "draft" | draft \| published |
| config_json | text, default "{}" | JSON 配置 |
| owner_id | int, FK→users.id, not null | 所有者 |
| created_at | datetime | 创建时间 |
| updated_at | datetime | 更新时间 |

### config_json 结构

```json
{
  "model": "",
  "provider": "",
  "skill_ids": [],
  "kb_ids": [],
  "prompt": ""
}
```

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/apps | 当前用户列表；admin 加 `?all=true` 查看全部 |
| POST | /api/apps | 创建应用 |
| GET | /api/apps/:id | 应用详情（含 config_json） |
| PATCH | /api/apps/:id | 更新应用配置 |
| DELETE | /api/apps/:id | 删除应用 |
| PATCH | /api/apps/:id/status | 切换 draft/published |

## 前端路由

- `/studio` → 应用列表页
- `/studio/:id` → 应用配置页

创建通过列表页的弹窗完成，不占用独立路由。

## 前端组件树

```
pages/Studio/
├── StudioPage.tsx          # 应用列表页
├── StudioAppCard.tsx       # 应用卡片
├── CreateAppDialog.tsx     # 创建弹窗
├── AppConfigPage.tsx       # 应用配置页（核心）
└── StudioChatPreview.tsx   # 右侧聊天测试组件

store/
├── useStudioStore.ts       # 应用相关状态

types/index.ts              # 新增 App 类型
lib/api.ts                  # 新增 app API 方法
```

### 组件职责

**StudioPage**
- 搜索/筛选/分页
- admin 模式下切换「我的应用/全部应用」
- 「创建应用」按钮 → 弹出 CreateAppDialog
- 点击卡片 → 跳转 AppConfigPage

**CreateAppDialog**
- 表单：名称、图标（lucide 库选择）、介绍
- 创建成功后关闭弹窗，刷新列表

**AppConfigPage**
- 路由参数 `:id` 加载应用
- 左侧配置面板：模型选择、技能配置、提示词、知识库
- 右侧 StudioChatPreview 实时聊天测试
- 顶部操作栏：返回、保存、发布/草稿切换、删除

**StudioChatPreview**
- 聊天消息列表
- 输入框 + 发送按钮
- 点击发送时调后端 chat 接口，使用当前应用的配置

### 后端结构

```plaintext
backend/app/
├── models.py           # + App ORM
├── schemas.py          # + AppCreate, AppUpdate, AppOut, AppStatusUpdate
├── routers/
│   └── apps.py         # app 路由
├── services/
│   └── app_service.py  # 应用业务逻辑
└── main.py             # 注册 app.include_router(apps.router)
```

## 后端 ORM

```python
class App(Base):
    __tablename__ = "apps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(32), default="🤖")
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(32), default="chat_assistant")
    category: Mapped[str] = mapped_column(String(32), default="chat_assistant")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped["User"] = relationship(back_populates="apps")
```

同时在 `User` 模型中添加 `apps` 关系。

## 后端 Pydantic Schemas

```python
class AppCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    icon: str = "🤖"
    description: str = ""

class AppUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    icon: str | None = None
    description: str | None = None
    config_json: str | None = None

class AppStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|published)$")

class AppOut(BaseModel):
    id: int
    name: str
    icon: str
    description: str
    type: str
    category: str
    status: str
    config_json: str
    owner_id: int
    owner_username: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
```

## 前端类型定义

```typescript
export interface App {
  id: number;
  name: string;
  icon: string;
  description: string;
  type: string;
  category: string;
  status: 'draft' | 'published';
  configJson: string;
  ownerId: number;
  ownerUsername?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppConfig {
  model: string;
  provider: string;
  skill_ids: number[];
  kb_ids: number[];
  prompt: string;
}
```

## 配置页左侧面板

从顶部到底部：

1. **模型选择** — 下拉框，列出已激活的 LLM provider 的可用模型
2. **技能配置** — 多选，从已有技能列表中选取（checkbox 列表或 tag 选择器）
3. **提示词 (System Prompt)** — 多行文本框，monospace 字体
4. **关联知识库** — 多选，从用户的知识库列表中选取

## 配置页右侧面板 (StudioChatPreview)

- 消息列表（气泡样式）
- 首条消息显示应用的 system prompt + 知识库上下文的自定义欢迎语
- 输入框 + 发送按钮
- 发送时调后端 `/api/apps/:id/chat` 接口，后端用该应用的配置（模型/skills/kbs/prompt）做推理
- 消息历史保存在前端状态中，不清除

## 后端 Chat 接口

```
POST /api/apps/:id/chat
Body: { "question": "用户消息" }
Response: { "answer": "AI 回答" }
```

后端从 `apps` 表加载 config_json，组装 system prompt + 技能内容 + 知识库 RAG 上下文，调用配置的 LLM provider 生成回答。

## 状态管理

新建 `useStudioStore.ts`，职责：
- `apps` — 应用列表
- `loading` / `error`
- `loadApps(all?)` — 拉取列表
- `createApp(payload)` — 创建
- `updateApp(id, data)` — 更新
- `deleteApp(id)` — 删除
- `toggleStatus(id)` — 切换发布/草稿
