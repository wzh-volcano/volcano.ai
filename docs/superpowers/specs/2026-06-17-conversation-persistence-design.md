# 对话持久化设计方案

## 目标

为 Studio 应用预览测试页（StudioChatPreview）增加对话历史持久化能力，支持多轮对话自动保存、历史对话回顾、对话摘要管理。

## 数据模型

### Conversation（对话）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | |
| app_id | FK → apps.id | 所属应用 |
| title | String(256) | 对话标题，首条消息自动生成 |
| summary | Text, nullable | 压缩摘要，由 `/compress` 写入 |
| message_count | Integer | 消息总数 |
| owner_id | FK → users.id | 创建者 |
| created_at | DateTime | |
| updated_at | DateTime | |

### Message（消息）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer PK | |
| conversation_id | FK → conversations.id | 所属对话 |
| role | String(16) | user / assistant |
| content | Text | 消息内容 |
| token_count | Integer | 预估 token 数 |
| created_at | DateTime | |

## API 端点

```
POST   /api/apps/{app_id}/conversations          创建对话（含首条消息）
GET    /api/apps/{app_id}/conversations          列出对话（按 updated_at 倒序）
GET    /api/conversations/{conv_id}              获取对话详情
PATCH  /api/conversations/{conv_id}              更新 title / summary
DELETE /api/conversations/{conv_id}              删除对话
POST   /api/conversations/{conv_id}/messages     追加消息（批量）
GET    /api/conversations/{conv_id}/messages     列出消息（按 created_at 升序）
```

- 创建对话时如果传了 messages 则同时写入首条消息
- 追加消息支持批量（如一次写入 user + assistant 两条）
- 删除对话会级联删除所有消息

## 后端模块

- `backend/app/models.py` — 新增 Conversation + Message ORM
- `backend/app/schemas.py` — 新增对应 Pydantic schema
- `backend/app/routers/conversations.py` — 新 router，全部端点
- `backend/app/database.py` — `_migrate_add_columns` 补充新列
- `backend/app/main.py` — 注册新 router

## 自动保存流程

```
用户在 chat preview 输入问题
  → POST /api/apps/{app_id}/chat (SSE)
  → 流式渲染 assistant 回复
  → 回复完成后自动调用 POST /api/conversations/{id}/messages
    批量写入 user 消息 + assistant 消息
```

- 新对话：用户首次发消息时自动创建（`POST /api/conversations`）
- 后续同一对话的消息追加到现有 conversation
- 对话 id 通过 URL 参数 `?conversation_id=N` 或 store 传递

## 前端集成

### Rightbar 改造为共用面板

当前 Rightbar 硬编码了 GitPanel/GoalPanel/ProgressPanel，改为根据当前路由动态渲染内容：

```
路由               Rightbar 内容
/knowledge-base    Git + Goal + Progress（原内容）
/studio/*          对话历史列表（ConversationList）
/plugins           原内容
/users             原内容
/skills            原内容
```

### ConversationList 组件

- 列出当前 app 的所有对话（按 updated_at 倒序）
- 每项显示：title（或 "对话 N"）、消息数、更新时间
- 当前对话高亮
- 点击切换对话 → 加载对应消息 → URL 更新 `?conversation_id=`
- 条目旁提供删除按钮
- 顶部有"新对话"按钮

### StudioChatPreview 改动

- 加载时检查 `conversation_id`，有则从 API 拉消息
- 无 conversation_id 时显示空状态"开始新对话"
- 发消息后自动创建/追加 conversation
- 对话完成后追加消息到后端
- /compress 后更新后端 summary

### StudioPage 改动

- 进入 app config 时，URL 带 conversation_id 参数
- 右侧 Rightbar 展示对话列表

## 状态管理

在 `useAppStore` 或新建 `useConversationStore` 中管理：

```
currentConversationId: number | null
conversations: Conversation[]
messages: Message[]
loading: boolean
```

## 不做的事情

- 不提供手动"保存"按钮（全部自动）
- 不做对话重命名（标题由首条消息内容截取生成）
- 不做批量操作
- 不改变现有聊天 SSE 流程
