# Conversation Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist Studio chat preview conversations to SQLite, with auto-save, history listing in Rightbar, and full CRUD API.

**Architecture:** Backend adds Conversation + Message ORM models and a new router (`/api/conversations`). Frontend adds a Zustand store, dynamic Rightbar with ConversationList, and integrates StudioChatPreview with auto-save on message completion.

**Tech Stack:** Python + FastAPI + SQLAlchemy (backend), React + Zustand + TypeScript (frontend)

---

### Task 1: Backend ORM models — Conversation + Message

**Files:**
- Modify: `backend/app/models.py` — append after `App` class

- [ ] **Step 1: Add Conversation and Message models**

Insert at end of `backend/app/models.py`:

```python
class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    app_id: Mapped[int] = mapped_column(ForeignKey("apps.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(256), default="")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    owner: Mapped["User"] = relationship(back_populates="conversations")
    app: Mapped["App"] = relationship(back_populates="conversations")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    conversation: Mapped["Conversation"] = relationship(back_populates="messages")
```

Also add relationship on `User` and `App` models.

In `User` class, add after `apps` relationship (around line 131):
```python
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
```

In `App` class, add after `owner` relationship (around line 181):
```python
    conversations: Mapped[list["Conversation"]] = relationship(
        back_populates="app", cascade="all, delete-orphan"
    )
```

Add relationship on `Conversation` for `messages`:
```python
    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )
```

- [ ] **Step 2: Verify models load correctly**

Run: `cd backend && .venv\Scripts\python -c "from app.models import Conversation, Message; print('OK')"`
Expected: prints "OK"

- [ ] **Step 3: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add Conversation and Message ORM models"
```

---

### Task 2: Backend Pydantic schemas

**Files:**
- Modify: `backend/app/schemas.py` — append new schemas

- [ ] **Step 1: Add conversation schemas**

Append to `backend/app/schemas.py`:

```python
# ---------- Conversation ----------
class ConversationCreate(BaseModel):
    title: str = ""


class ConversationUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None


class ConversationOut(BaseModel):
    id: int
    app_id: int
    title: str
    summary: str | None = None
    message_count: int
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    token_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)


class MessagesBatchCreate(BaseModel):
    messages: list[MessageCreate] = Field(..., min_length=1)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add conversation schemas"
```

---

### Task 3: Backend conversations router

**Files:**
- Create: `backend/app/routers/conversations.py`

- [ ] **Step 1: Create conversations router**

```python
"""对话持久化路由：CRUD + 消息管理。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import Conversation, Message, User

router = APIRouter(tags=["conversations"])


def _get_conv_or_404(conv_id: int, db: Session, current_user: User) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user.role != "admin" and conv.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conv


def _conv_to_out(conv: Conversation) -> dict:
    return {
        "id": conv.id,
        "app_id": conv.app_id,
        "title": conv.title,
        "summary": conv.summary,
        "message_count": conv.message_count,
        "owner_id": conv.owner_id,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }


# ========== Conversation CRUD ==========


@router.get("/api/apps/{app_id}/conversations", response_model=list[schemas.ConversationOut])
def list_conversations(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """列出某个 App 下的所有对话（按 updated_at 倒序）。"""
    stmt = (
        select(Conversation)
        .where(Conversation.app_id == app_id)
        .order_by(Conversation.updated_at.desc())
    )
    if current_user.role != "admin":
        stmt = stmt.where(Conversation.owner_id == current_user.id)
    return [_conv_to_out(c) for c in db.scalars(stmt)]


@router.post("/api/apps/{app_id}/conversations", response_model=schemas.ConversationOut, status_code=201)
def create_conversation(
    app_id: int,
    payload: schemas.ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """创建新对话。"""
    conv = Conversation(
        app_id=app_id,
        title=payload.title,
        owner_id=current_user.id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conv_to_out(conv)


@router.get("/api/conversations/{conv_id}", response_model=schemas.ConversationOut)
def get_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    conv = _get_conv_or_404(conv_id, db, current_user)
    return _conv_to_out(conv)


@router.patch("/api/conversations/{conv_id}", response_model=schemas.ConversationOut)
def update_conversation(
    conv_id: int,
    payload: schemas.ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    conv = _get_conv_or_404(conv_id, db, current_user)
    if payload.title is not None:
        conv.title = payload.title
    if payload.summary is not None:
        conv.summary = payload.summary
    db.commit()
    db.refresh(conv)
    return _conv_to_out(conv)


@router.delete("/api/conversations/{conv_id}", status_code=204)
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    conv = _get_conv_or_404(conv_id, db, current_user)
    db.delete(conv)
    db.commit()


# ========== Messages ==========


@router.get("/api/conversations/{conv_id}/messages", response_model=list[schemas.MessageOut])
def list_messages(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """列出对话的所有消息（按 created_at 升序）。"""
    conv = _get_conv_or_404(conv_id, db, current_user)
    stmt = (
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
    )
    rows = db.scalars(stmt).all()
    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "token_count": m.token_count,
            "created_at": m.created_at,
        }
        for m in rows
    ]


@router.post("/api/conversations/{conv_id}/messages", response_model=list[schemas.MessageOut], status_code=201)
def add_messages(
    conv_id: int,
    payload: schemas.MessagesBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """批量追加消息（如一次写入 user + assistant 两条）。更新 conversation 的 message_count。"""
    conv = _get_conv_or_404(conv_id, db, current_user)

    saved: list[Message] = []
    for m in payload.messages:
        msg = Message(
            conversation_id=conv_id,
            role=m.role,
            content=m.content,
            token_count=len(m.content),
        )
        db.add(msg)
        saved.append(msg)
        db.flush()

    conv.message_count = (conv.message_count or 0) + len(payload.messages)
    db.commit()

    for m in saved:
        db.refresh(m)

    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "token_count": m.token_count,
            "created_at": m.created_at,
        }
        for m in saved
    ]
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/conversations.py
git commit -m "feat: add conversations router with CRUD + messages"
```

---

### Task 4: Register conversations router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Import and register router**

After line 29 (`skills,`) add:
```python
    conversations,
```

After line 97 (`app.include_router(skills.router)`) add:
```python
app.include_router(conversations.router)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register conversations router"
```

---

### Task 5: Frontend TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add Conversation and Message types**

Append to `frontend/src/types/index.ts`:

```typescript
export interface Conversation {
  id: number;
  app_id: number;
  title: string;
  summary: string | null;
  message_count: number;
  owner_id: number;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add Conversation and ChatMessage types"
```

---

### Task 6: Frontend API layer

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add conversation API methods**

Append before the closing `};` of the `api` object:

```typescript
  // ========== 对话持久化 ==========
  /** 列出 App 下的所有对话 */
  listConversations: async (appId: number): Promise<Conversation[]> => {
    return request<Conversation[]>(`/api/apps/${appId}/conversations`);
  },

  /** 创建新对话 */
  createConversation: async (appId: number, title?: string): Promise<Conversation> => {
    return request<Conversation>(`/api/apps/${appId}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title ?? '' }),
    });
  },

  /** 获取对话详情 */
  getConversation: async (convId: number): Promise<Conversation> => {
    return request<Conversation>(`/api/conversations/${convId}`);
  },

  /** 更新对话（title / summary） */
  updateConversation: async (convId: number, data: { title?: string; summary?: string }): Promise<Conversation> => {
    return request<Conversation>(`/api/conversations/${convId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  /** 删除对话 */
  deleteConversation: async (convId: number): Promise<void> => {
    await request<void>(`/api/conversations/${convId}`, { method: 'DELETE' });
  },

  /** 列出对话的所有消息 */
  listMessages: async (convId: number): Promise<ChatMessage[]> => {
    return request<ChatMessage[]>(`/api/conversations/${convId}/messages`);
  },

  /** 批量追加消息 */
  addMessages: async (convId: number, messages: { role: string; content: string }[]): Promise<ChatMessage[]> => {
    return request<ChatMessage[]>(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
  },
```

Also add the `Conversation` import at the top of the file (update the import line):
```typescript
import type { App, Conversation, DocumentChunk, KbCreatePayload, KnowledgeBase, KnowledgeBaseFile, Plugin, User } from '@/types';
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add conversation API methods"
```

---

### Task 7: Frontend conversation store

**Files:**
- Create: `frontend/src/store/useConversationStore.ts`

- [ ] **Step 1: Create useConversationStore**

```typescript
import { create } from 'zustand';
import type { Conversation, ChatMessage } from '@/types';
import { api } from '@/lib/api';

interface ConversationState {
  conversations: Conversation[];
  currentConvId: number | null;
  messages: ChatMessage[];
  loading: boolean;

  loadConversations: (appId: number) => Promise<void>;
  createConversation: (appId: number) => Promise<Conversation>;
  selectConversation: (convId: number) => Promise<void>;
  deleteConversation: (convId: number, appId: number) => Promise<void>;
  addMessages: (convId: number, msgs: { role: string; content: string }[]) => Promise<void>;
  updateSummary: (convId: number, summary: string) => Promise<void>;
  reset: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  currentConvId: null,
  messages: [],
  loading: false,

  loadConversations: async (appId: number) => {
    set({ loading: true });
    try {
      const conversations = await api.listConversations(appId);
      set({ conversations, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  createConversation: async (appId: number) => {
    const conv = await api.createConversation(appId);
    set((state) => ({
      conversations: [conv, ...state.conversations],
      currentConvId: conv.id,
      messages: [],
    }));
    return conv;
  },

  selectConversation: async (convId: number) => {
    set({ currentConvId: convId, loading: true });
    try {
      const messages = await api.listMessages(convId);
      set({ messages, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  deleteConversation: async (convId: number, appId: number) => {
    await api.deleteConversation(convId);
    const { currentConvId } = get();
    set((state) => ({
      conversations: state.conversations.filter((c) => c.id !== convId),
      currentConvId: currentConvId === convId ? null : currentConvId,
      messages: currentConvId === convId ? [] : state.messages,
    }));
  },

  addMessages: async (convId: number, msgs: { role: string; content: string }[]) => {
    const saved = await api.addMessages(convId, msgs);
    set((state) => ({
      messages: [...state.messages, ...saved.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))],
    }));
    // Refresh conversation list to update message_count
    const conv = get().conversations.find((c) => c.id === convId);
    if (conv) {
      conv.message_count += msgs.length;
      set({ conversations: [...get().conversations] });
    }
  },

  updateSummary: async (convId: number, summary: string) => {
    await api.updateConversation(convId, { summary });
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === convId ? { ...c, summary } : c
      ),
    }));
  },

  reset: () => {
    set({ conversations: [], currentConvId: null, messages: [], loading: false });
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/store/useConversationStore.ts
git commit -m "feat: add useConversationStore"
```

---

### Task 8: Dynamic Rightbar + ConversationList

**Files:**
- Modify: `frontend/src/sections/Rightbar/Rightbar.tsx`
- Create: `frontend/src/sections/Rightbar/ConversationList.tsx`

- [ ] **Step 1: Create ConversationList component**

```typescript
import React, { useEffect } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useConversationStore } from '@/store/useConversationStore';
import { Panel } from '@/components/Panel';
import { Plus, Trash2, MessageSquare, Loader2 } from 'lucide-react';

export const ConversationList: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const appId = Number(id);

  const conversations = useConversationStore((s) => s.conversations);
  const currentConvId = useConversationStore((s) => s.currentConvId);
  const loading = useConversationStore((s) => s.loading);
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const createConversation = useConversationStore((s) => s.createConversation);
  const selectConversation = useConversationStore((s) => s.selectConversation);
  const deleteConversation = useConversationStore((s) => s.deleteConversation);

  useEffect(() => {
    if (appId) loadConversations(appId);
  }, [appId, loadConversations]);

  const handleNew = async () => {
    const conv = await createConversation(appId);
    setSearchParams({ conversation_id: String(conv.id) });
  };

  const handleSelect = async (convId: number) => {
    await selectConversation(convId);
    setSearchParams({ conversation_id: String(convId) });
  };

  const handleDelete = async (e: React.MouseEvent, convId: number) => {
    e.stopPropagation();
    await deleteConversation(convId, appId);
    if (currentConvId === convId) {
      setSearchParams({});
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-medium text-text">对话历史</h3>
        <button
          onClick={handleNew}
          className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
        >
          <Plus size={14} /> 新对话
        </button>
      </div>

      {loading && conversations.length === 0 ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin text-text-dim" />
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-[12px] text-text-dim text-center py-8">暂无对话记录</p>
      ) : (
        <ul className="flex-1 overflow-y-auto space-y-1">
          {conversations.map((conv) => (
            <li
              key={conv.id}
              onClick={() => handleSelect(conv.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] cursor-pointer transition-colors group ${
                currentConvId === conv.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-text hover:bg-bg-hover'
              }`}
            >
              <MessageSquare size={14} className="shrink-0" />
              <span className="flex-1 truncate">
                {conv.title || `对话 ${conv.id}`}
              </span>
              <span className="text-[10px] text-text-dim">{conv.message_count}</span>
              <button
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-error transition-all"
              >
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Update Rightbar to be dynamic**

Replace `frontend/src/sections/Rightbar/Rightbar.tsx` entirely:

```typescript
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { Panel } from '@/components/Panel';
import { ConversationList } from './ConversationList';
import { Check } from 'lucide-react';

const GitPanel: React.FC = () => {
  const gitChanges = useAppStore((s) => s.gitChanges);
  return (
    <Panel>
      <h3 className="text-[13px] font-medium text-text mb-3">Git tools</h3>
      {gitChanges.map((change, i) => (
        <div key={i} className="flex justify-between items-center py-1.5 text-[13px] text-text hover:text-white transition-colors cursor-pointer">
          <span className="flex items-center gap-1.5">
            {i === 0 && <span className="text-xs">📋</span>}
            {i === 1 && <span className="text-xs">⎇</span>}
            {i === 2 && <span className="text-xs">⤴</span>}
            {change.label}
            {i === 1 && <span className="text-[10px] text-text-mute ml-1">▾</span>}
          </span>
          {change.add !== undefined && change.del !== undefined && (
            <span className="flex gap-2 text-xs">
              <span className="text-success">+{change.add}</span>
              <span className="text-error">-{change.del}</span>
            </span>
          )}
          {i === 2 && <span className="text-text-mute">···</span>}
        </div>
      ))}
    </Panel>
  );
};

const GoalPanel: React.FC = () => {
  const goalTitle = useAppStore((s) => s.goalTitle);
  const goalMeta = useAppStore((s) => s.goalMeta);
  const goalStatus = useAppStore((s) => s.goalStatus);
  return (
    <Panel>
      <div className="flex justify-between items-center mb-2.5">
        <h3 className="text-[13px] font-medium text-text">Goal</h3>
        <span className="text-2xs text-success bg-success/10 px-2 py-0.5 rounded-full">{goalStatus}</span>
      </div>
      <div className="text-[13px] text-text leading-relaxed">⊙ {goalTitle}</div>
      <div className="text-[11.5px] text-text-mute mt-1.5">{goalMeta}</div>
    </Panel>
  );
};

const ProgressPanel: React.FC = () => {
  const progressItems = useAppStore((s) => s.progressItems);
  return (
    <Panel>
      <h3 className="text-[13px] font-medium text-text mb-3">Progress</h3>
      <ul className="list-none">
        {progressItems.map((item, i) => (
          <li key={i} className="flex gap-2 py-1 text-[13px] text-text-dim leading-relaxed">
            <span className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-success text-success text-[10px] shrink-0 mt-0.5">
              <Check size={10} />
            </span>
            {item.text}
          </li>
        ))}
      </ul>
    </Panel>
  );
};

export const Rightbar: React.FC = () => {
  const location = useLocation();
  const isStudioPage = location.pathname.startsWith('/studio/');

  return (
    <aside className="bg-bg-2 border-l border-border p-3.5 overflow-y-auto flex flex-col gap-3.5">
      {isStudioPage ? (
        <Panel>
          <ConversationList />
        </Panel>
      ) : (
        <>
          <GitPanel />
          <GoalPanel />
          <ProgressPanel />
        </>
      )}
    </aside>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/sections/Rightbar/Rightbar.tsx frontend/src/sections/Rightbar/ConversationList.tsx
git commit -m "feat: dynamic Rightbar with ConversationList for Studio"
```

---

### Task 9: Integrate StudioChatPreview with conversation persistence

**Files:**
- Modify: `frontend/src/pages/Studio/StudioChatPreview.tsx`

- [ ] **Step 1: Integrate auto-save into StudioChatPreview**

Key changes:
1. Accept `conversationId` prop or read from URL search params
2. On mount, if conversationId is set, load messages from store
3. After each complete user→assistant exchange, auto-save both messages
4. Update conversation summary after compress

Update the Props interface to accept optional conversationId:

```typescript
interface Props {
  appId: number;
  config: {
    model: string;
    provider: string;
    prompt: string;
    skill_ids: number[];
    kb_ids: number[];
    maxTokens?: number;
  };
  conversationId?: number;
  onMessagesChange?: (count: number) => void;
}
```

Add imports at top:
```typescript
import { useConversationStore } from '@/store/useConversationStore';
```

Remove the local `ChatMessage` interface (it's now in types/index.ts).

Replace the `useState<ChatMessage[]>` with store integration:

At component start, after all useStates:
```typescript
  const storeConvId = useConversationStore((s) => s.currentConvId);
  const storeMessages = useConversationStore((s) => s.messages);
  const storeAddMessages = useConversationStore((s) => s.addMessages);
  const storeSelectConversation = useConversationStore((s) => s.selectConversation);
  const storeUpdateSummary = useConversationStore((s) => s.updateSummary);

  const effectiveConvId = conversationId ?? storeConvId;

  // When conversationId prop changes, load messages
  useEffect(() => {
    if (effectiveConvId && storeConvId !== effectiveConvId) {
      storeSelectConversation(effectiveConvId);
    }
  }, [effectiveConvId]);

  // Sync store messages to local state
  useEffect(() => {
    if (storeConvId === effectiveConvId && storeMessages.length > 0) {
      setMessages(storeMessages);
    }
  }, [storeMessages, storeConvId, effectiveConvId]);
```

After stream completes (where done flag is received), call auto-save:

Find the done handling in the SSE reader, after the stream finishes, add:
```typescript
  // Auto-save after complete exchange
  if (effectiveConvId) {
    const userMsg = messages[messages.length - 2];
    const assistantMsg = messages[messages.length - 1];
    if (userMsg && assistantMsg) {
      storeAddMessages(effectiveConvId, [
        { role: 'user', content: userMsg.content },
        { role: 'assistant', content: assistantMsg.content },
      ]);
      if (onMessagesChange) onMessagesChange(messages.length);
    }
  }
```

In the compress handler, after receiving summary:
```typescript
  if (effectiveConvId) {
    storeUpdateSummary(effectiveConvId, summary);
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Studio/StudioChatPreview.tsx
git commit -m "feat: integrate StudioChatPreview with conversation persistence"
```

---

### Task 10: Update AppConfigPage

**Files:**
- Modify: `frontend/src/pages/Studio/AppConfigPage.tsx`

- [ ] **Step 1: Pass conversation context to StudioChatPreview**

Add imports:
```typescript
import { useSearchParams } from 'react-router-dom';
import { useConversationStore } from '@/store/useConversationStore';
```

Add state near other useStates (around line 56):
```typescript
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversation_id');
  const loadConversations = useConversationStore((s) => s.loadConversations);
  const resetConversations = useConversationStore((s) => s.reset);
```

On mount (in the `useEffect` that loads the app), also load conversations:
```typescript
  useEffect(() => {
    if (app) {
      loadConversations(app.id);
    }
    return () => { resetConversations(); };
  }, [app?.id]);
```

Update the StudioChatPreview usage:
```typescript
  <StudioChatPreview
    appId={app.id}
    config={{ model, provider, prompt, skill_ids: skillIds, kb_ids: kbIds, maxTokens }}
    conversationId={conversationId ? Number(conversationId) : undefined}
  />
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Studio/AppConfigPage.tsx
git commit -m "feat: pass conversation context to StudioChatPreview"
```

---

### Task 11: Verify end-to-end

- [ ] **Step 1: Start backend and check models**

```bash
cd backend
.venv\Scripts\python -c "
from app.database import init_db
init_db()
from app.models import Conversation, Message
print('Tables created:', Conversation.__tablename__, Message.__tablename__)
"
```
Expected: "Tables created: conversations messages"

- [ ] **Step 2: Start frontend and check compilation**

```bash
cd frontend
npx tsc --noEmit
```
Expected: No type errors

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: complete conversation persistence for Studio preview"
```
