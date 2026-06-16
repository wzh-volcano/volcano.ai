# Studio Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a studio module where users create and configure AI chat assistant apps.

**Architecture:** Single `apps` table with JSON config blob. Backend FastAPI CRUD + chat endpoint. Frontend React with Zustand store, 3-page structure (list, create dialog, config page with live preview).

**Tech Stack:** Python FastAPI + SQLAlchemy + SQLite (backend), React 18 + TypeScript + Vite + TailwindCSS + Zustand (frontend)

---

### Task 1: App ORM Model

**Files:**
- Modify: `backend/app/models.py` (add App model + User.apps relationship)

- [ ] **Step 1: Add App model to models.py**

Add after `ProviderConfig` class:

```python
class App(Base):
    __tablename__ = "apps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    icon: Mapped[str] = mapped_column(String(32), default="\U0001f916")
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(32), default="chat_assistant")
    category: Mapped[str] = mapped_column(String(32), default="chat_assistant")
    status: Mapped[str] = mapped_column(String(16), default="draft")
    config_json: Mapped[str] = mapped_column(Text, default="{}")
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    owner: Mapped["User"] = relationship(back_populates="apps")
```

- [ ] **Step 2: Add `apps` relationship to User model**

Inside the `User` class, add after `skills`:

```python
    apps: Mapped[list["App"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
```

- [ ] **Step 3: Run server to verify models load**

Run: `cd backend && python -c "from app.database import init_db; init_db(); print('OK')"`
Expected: `OK` (no import errors)

- [ ] **Step 4: Commit**

```bash
git add backend/app/models.py
git commit -m "feat: add App ORM model"
```

---

### Task 2: Pydantic Schemas

**Files:**
- Modify: `backend/app/schemas.py` (add App schemas)

- [ ] **Step 1: Add App schemas**

Add after the `SkillOut` class:

```python
# ---------- App ----------
class AppCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    icon: str = "\U0001f916"
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


class AppChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
```

- [ ] **Step 2: Verify schemas import**

Run: `cd backend && python -c "from app.schemas import AppCreate, AppUpdate, AppOut, AppStatusUpdate, AppChatRequest; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas.py
git commit -m "feat: add App pydantic schemas"
```

---

### Task 3: App Router

**Files:**
- Create: `backend/app/routers/apps.py`

- [ ] **Step 1: Create apps router**

```python
"""应用（App）CRUD + 聊天路由。"""
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user, get_current_admin
from ..models import App, User

router = APIRouter(prefix="/api/apps", tags=["apps"])


def _to_out(app: App) -> dict:
    return {
        "id": app.id,
        "name": app.name,
        "icon": app.icon,
        "description": app.description,
        "type": app.type,
        "category": app.category,
        "status": app.status,
        "config_json": app.config_json,
        "owner_id": app.owner_id,
        "owner_username": app.owner.username if app.owner else None,
        "created_at": app.created_at,
        "updated_at": app.updated_at,
    }


def get_app_or_404(app_id: int, db: Session, current_user: User) -> App:
    app = db.get(App, app_id)
    if app is None:
        raise HTTPException(status_code=404, detail="应用不存在")
    if current_user.role != "admin" and app.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="应用不存在")
    return app


@router.get("", response_model=list[schemas.AppOut])
def list_apps(
    all_: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    """列出应用。普通用户只看自己的，admin 传 ?all=true 看全部。"""
    if all_ and current_user.role == "admin":
        stmt = select(App)
    else:
        stmt = select(App).where(App.owner_id == current_user.id)
    stmt = stmt.order_by(App.updated_at.desc())
    apps = list(db.scalars(stmt))
    for a in apps:
        a.owner_username = a.owner.username if a.owner else None
    return [_to_out(a) for a in apps]


@router.post("", response_model=schemas.AppOut, status_code=201)
def create_app(
    payload: schemas.AppCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = App(
        name=payload.name,
        icon=payload.icon,
        description=payload.description,
        owner_id=current_user.id,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    app.owner_username = current_user.username
    return _to_out(app)


@router.get("/{app_id}", response_model=schemas.AppOut)
def get_app(
    app_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    return _to_out(app)


@router.patch("/{app_id}", response_model=schemas.AppOut)
def update_app(
    app_id: int,
    payload: schemas.AppUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    if payload.name is not None:
        app.name = payload.name
    if payload.icon is not None:
        app.icon = payload.icon
    if payload.description is not None:
        app.description = payload.description
    if payload.config_json is not None:
        # 验证是合法 JSON
        try:
            json.loads(payload.config_json)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="config_json 必须是合法 JSON")
        app.config_json = payload.config_json
    db.commit()
    db.refresh(app)
    app.owner_username = app.owner.username if app.owner else None
    return _to_out(app)


@router.delete("/{app_id}", status_code=204)
def delete_app(
    app_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    app = get_app_or_404(app_id, db, current_user)
    db.delete(app)
    db.commit()


@router.patch("/{app_id}/status", response_model=schemas.AppOut)
def update_app_status(
    app_id: int,
    payload: schemas.AppStatusUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    app = get_app_or_404(app_id, db, current_user)
    app.status = payload.status
    db.commit()
    db.refresh(app)
    return _to_out(app)
```

- [ ] **Step 2: Register router in main.py**

In `backend/app/main.py`, add import and router registration:

Add import:
```python
from .routers import apps
```

Add after skills router:
```python
app.include_router(apps.router)
```

- [ ] **Step 3: Start backend to verify routes work**

Run: `cd backend && uvicorn app.main:app --reload --port 8000`
Expected: Server starts without errors, GET `/api/health` returns `{"status":"ok"}`

- [ ] **Step 4: Quick smoke test**

```bash
curl -s http://localhost:8000/api/apps | head -c 100
```
Expected: `[]` (empty list)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/apps.py backend/app/main.py
git commit -m "feat: add app CRUD API routes"
```

---

### Task 4: Frontend Types and API Methods

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add App and AppConfig types**

Add to `frontend/src/types/index.ts`:

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
```

- [ ] **Step 2: Add AppOut type and mapping function**

Add near other API response types in `api.ts`:

```typescript
export interface AppOut {
  id: number;
  name: string;
  icon: string;
  description: string;
  type: string;
  category: string;
  status: string;
  config_json: string;
  owner_id: number;
  owner_username: string | null;
  created_at: string;
  updated_at: string;
}
```

Add mapping function near other `map*` functions:

```typescript
function mapApp(a: AppOut): App {
  return {
    id: a.id,
    name: a.name,
    icon: a.icon,
    description: a.description,
    type: a.type,
    category: a.category,
    status: a.status as 'draft' | 'published',
    configJson: a.config_json,
    ownerId: a.owner_id,
    ownerUsername: a.owner_username ?? undefined,
    createdAt: formatDate(a.created_at),
    updatedAt: formatDate(a.updated_at),
  };
}
```

- [ ] **Step 3: Add App API methods**

Add to the `api` object:

```typescript
  // ========== 应用管理 (Studio) ==========
  /** 应用列表 */
  listApps: async (all?: boolean): Promise<App[]> => {
    const url = all ? '/api/apps?all=true' : '/api/apps';
    const data = await request<AppOut[]>(url);
    return data.map(mapApp);
  },

  /** 创建应用 */
  createApp: async (payload: { name: string; icon?: string; description?: string }): Promise<App> => {
    const data = await request<AppOut>('/api/apps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return mapApp(data);
  },

  /** 获取应用详情 */
  getApp: async (id: number): Promise<App> => {
    const data = await request<AppOut>(`/api/apps/${id}`);
    return mapApp(data);
  },

  /** 更新应用 */
  updateApp: async (id: number, data: { name?: string; icon?: string; description?: string; config_json?: string }): Promise<App> => {
    const result = await request<AppOut>(`/api/apps/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return mapApp(result);
  },

  /** 删除应用 */
  deleteApp: async (id: number): Promise<void> => {
    await request<void>(`/api/apps/${id}`, { method: 'DELETE' });
  },

  /** 切换应用状态 */
  toggleAppStatus: async (id: number): Promise<App> => {
    const result = await request<AppOut>(`/api/apps/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'published' }),
    });
    return mapApp(result);
  },
```

- [ ] **Step 3: Run typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/lib/api.ts
git commit -m "feat: add App types and API methods"
```

---

### Task 5: Studio Store

**Files:**
- Create: `frontend/src/store/useStudioStore.ts`

- [ ] **Step 1: Create store**

```typescript
import { create } from 'zustand';
import type { App } from '@/types';
import { api } from '@/lib/api';

interface StudioState {
  apps: App[];
  loading: boolean;
  error: string | null;
  loadApps: (all?: boolean) => Promise<void>;
  createApp: (payload: { name: string; icon?: string; description?: string }) => Promise<App>;
  updateApp: (id: number, data: { name?: string; icon?: string; description?: string; config_json?: string }) => Promise<void>;
  deleteApp: (id: number) => Promise<void>;
  toggleStatus: (id: number) => Promise<void>;
}

export const useStudioStore = create<StudioState>((set, get) => ({
  apps: [],
  loading: false,
  error: null,

  loadApps: async (all?: boolean) => {
    set({ loading: true, error: null });
    try {
      const apps = await api.listApps(all);
      set({ apps, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  createApp: async (payload) => {
    const created = await api.createApp(payload);
    set((state) => ({ apps: [created, ...state.apps] }));
    return created;
  },

  updateApp: async (id, data) => {
    const updated = await api.updateApp(id, data);
    set((state) => ({
      apps: state.apps.map((a) =>
        a.id === id ? updated : a
      ),
    }));
  },

  deleteApp: async (id) => {
    const previous = get().apps;
    set((state) => ({ apps: state.apps.filter((a) => a.id !== id) }));
    try {
      await api.deleteApp(id);
    } catch (e) {
      set({ apps: previous, error: e instanceof Error ? e.message : String(e) });
    }
  },

  toggleStatus: async (id) => {
    const target = get().apps.find((a) => a.id === id);
    if (!target) return;
    const newStatus = target.status === 'draft' ? 'published' : 'draft';
    await api.toggleAppStatus(id);
    set((state) => ({
      apps: state.apps.map((a) =>
        a.id === id ? { ...a, status: newStatus } : a
      ),
    }));
  },
}));
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/useStudioStore.ts
git commit -m "feat: add studio store"
```

---

### Task 6: Router and Sidebar

**Files:**
- Modify: `frontend/src/router/index.tsx`
- Modify: `frontend/src/sections/Sidebar/Sidebar.tsx`

- [ ] **Step 1: Add /studio routes**

Add imports in `router/index.tsx`:
```typescript
import { StudioPage } from '@/pages/Studio/StudioPage';
import { AppConfigPage } from '@/pages/Studio/AppConfigPage';
```

Add routes after the `plugins` route:
```typescript
          {
            path: 'studio',
            element: <StudioPage />,
          },
          {
            path: 'studio/:id',
            element: <AppConfigPage />,
          },
```

- [ ] **Step 2: Add sidebar link**

In `Sidebar.tsx`, add before the admin-only section:

```typescript
        <NavLink to="/studio" className={menuItemClass}>
          <LayoutGrid size={16} className="text-text-dim" />
          工作室
        </NavLink>
```

Also add `LayoutGrid` to the lucide imports if not already there (it already is).

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors (pages don't exist yet, but imports will fail — we'll build pages next)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router/index.tsx frontend/src/sections/Sidebar/Sidebar.tsx
git commit -m "feat: add studio routes and sidebar link"
```

---

### Task 7: Studio List Page and App Card

**Files:**
- Create: `frontend/src/pages/Studio/StudioPage.tsx`
- Create: `frontend/src/pages/Studio/StudioAppCard.tsx`

- [ ] **Step 1: Create StudioAppCard**

```typescript
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { Pencil, Trash2, FileText, MessageCircle } from 'lucide-react';
import type { App } from '@/types';

interface Props {
  app: App;
  onEdit: (app: App) => void;
  onDelete: (app: App) => void;
}

export const StudioAppCard: React.FC<Props> = ({ app, onEdit, onDelete }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  const statusLabel = app.status === 'published' ? '已发布' : '草稿';
  const statusClass = app.status === 'published'
    ? 'bg-success/15 text-success'
    : 'bg-bg-3 text-text-dim border border-border';

  return (
    <div
      className="group flex flex-col p-4 rounded-xl border border-border bg-bg-2 hover:bg-bg-hover hover:border-border-strong transition-colors duration-150 cursor-pointer"
      onClick={() => navigate(`/studio/${app.id}`)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-10 h-10 rounded-xl bg-bg-3 border border-border inline-flex items-center justify-center shrink-0 text-lg">
          {app.icon || '🤖'}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(app); }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-active transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(app); }}
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-error hover:bg-error/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <h3 className="text-sm font-medium text-text mt-3 truncate">{app.name}</h3>
      <p className="text-xs text-text-dim mt-1 line-clamp-2 h-8">{app.description || '暂无描述'}</p>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs ${statusClass}`}>
          {statusLabel}
        </span>
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs bg-accent/15 text-accent">
          <MessageCircle size={10} />
          聊天助手
        </span>
      </div>
      {isAdmin && app.ownerUsername && (
        <div className="mt-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-bg-3 border border-border text-2xs text-text-dim">
          <span className="text-text-mute">拥有者：</span>
          <span className="text-text">{app.ownerUsername}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border text-2xs text-text-mute">
        <span>{app.type === 'chat_assistant' ? '聊天助手' : app.type}</span>
        <span>更新于 {app.updatedAt}</span>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create StudioPage**

```typescript
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useStudioStore } from '@/store/useStudioStore';
import { StudioAppCard } from './StudioAppCard';
import { CreateAppDialog } from './CreateAppDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  LayoutGrid,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { App } from '@/types';

const PAGE_SIZE = 8;

export const StudioPage: React.FC = () => {
  const navigate = useNavigate();
  const apps = useStudioStore((s) => s.apps);
  const loading = useStudioStore((s) => s.loading);
  const error = useStudioStore((s) => s.error);
  const loadApps = useStudioStore((s) => s.loadApps);
  const createApp = useStudioStore((s) => s.createApp);
  const deleteApp = useStudioStore((s) => s.deleteApp);
  const currentUser = useAuthStore((s) => s.currentUser);
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<App | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [query, setQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q)
    );
  }, [apps, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const handleCreate = async (payload: { name: string; icon?: string; description?: string }) => {
    setSubmitting(true);
    try {
      await createApp(payload);
      setCurrentPage(1);
      setFormOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteApp(deleteTarget.id);
      setDeleteTarget(null);
    }
  };

  const toggleShowAll = () => {
    setShowAll((prev) => {
      const next = !prev;
      loadApps(next);
      return next;
    });
  };

  const goPage = (p: number) => {
    if (p < 1 || p > totalPages) return;
    setCurrentPage(p);
  };

  return (
    <main className="flex flex-col bg-bg overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-text-dim" />
          <h2 className="text-base font-medium text-text">工作室</h2>
          <span className="text-xs text-text-mute ml-2">{filtered.length} 个应用</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-mute" />
            <Input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }}
              placeholder="搜索应用..."
              className="pl-8 w-56 h-8 text-xs"
            />
          </div>
          <Button size="sm" onClick={() => { setEditingApp(undefined); setFormOpen(true); }} className="gap-1.5" disabled={submitting}>
            <Plus size={14} />
            创建应用
          </Button>
        </div>
      </div>

      {/* Admin toggle */}
      {isAdmin && (
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border shrink-0">
          <button
            onClick={toggleShowAll}
            className={`px-2.5 py-1 rounded-full text-2xs transition-colors ${
              showAll
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-2 text-text-dim border border-border hover:bg-bg-3'
            }`}
          >
            {showAll ? '全部应用' : '我的应用'}
          </button>
          {showAll && (
            <span className="text-2xs text-text-mute">显示所有用户的应用</span>
          )}
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <Loader2 size={28} className="animate-spin text-text-mute" />
            <p className="text-sm">加载应用列表...</p>
          </div>
        ) : error && apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <AlertCircle size={28} className="text-warning" />
            <p className="text-sm">无法连接后端：{error}</p>
            <Button variant="ghost" size="sm" onClick={() => loadApps(showAll)}>重试</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-dim gap-3">
            <LayoutGrid size={40} className="text-text-mute opacity-50" />
            <p className="text-sm">{query ? '未找到匹配的应用' : '暂无应用'}</p>
            {!query && (
              <Button variant="ghost" size="sm" onClick={() => { setEditingApp(undefined); setFormOpen(true); }}>
                创建第一个应用
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {paginated.map((app) => (
                <StudioAppCard
                  key={app.id}
                  app={app}
                  onEdit={(a) => { setEditingApp(a); setFormOpen(true); }}
                  onDelete={(a) => setDeleteTarget(a)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-5">
                <button onClick={() => goPage(safePage - 1)} disabled={safePage <= 1}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button key={p} onClick={() => goPage(p)}
                    className={`w-7 h-7 inline-flex items-center justify-center rounded-md text-xs transition-colors ${
                      p === safePage ? 'bg-accent text-white' : 'text-text-dim hover:text-text hover:bg-bg-hover'
                    }`}>{p}</button>
                ))}
                <button onClick={() => goPage(safePage + 1)} disabled={safePage >= totalPages}
                  className="w-7 h-7 inline-flex items-center justify-center rounded-md text-text-dim hover:text-text hover:bg-bg-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <CreateAppDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editingApp}
        onSubmit={handleCreate}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-dim py-2">
            确定要删除应用 <span className="text-text font-medium">{deleteTarget?.name}</span> 吗？此操作不可恢复。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Studio/StudioPage.tsx frontend/src/pages/Studio/StudioAppCard.tsx
git commit -m "feat: add studio list page and app card"
```

---

### Task 8: Create App Dialog

**Files:**
- Create: `frontend/src/pages/Studio/CreateAppDialog.tsx`

- [ ] **Step 1: Create CreateAppDialog**

```typescript
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { App } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: App;
  onSubmit: (data: { name: string; icon?: string; description?: string }) => Promise<void>;
}

const ICON_OPTIONS = ['🤖', '💬', '🧠', '📚', '🔍', '✨', '🎯', '⚡', '🛠️', '🎨', '📊', '🔗'];

export const CreateAppDialog: React.FC<Props> = ({ open, onOpenChange, initialData, onSubmit }) => {
  const [name, setName] = useState(initialData?.name ?? '');
  const [icon, setIcon] = useState(initialData?.icon ?? '🤖');
  const [description, setDescription] = useState(initialData?.description ?? '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (open) {
      setName(initialData?.name ?? '');
      setIcon(initialData?.icon ?? '🤖');
      setDescription(initialData?.description ?? '');
      setError('');
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('应用名称不能为空');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), icon, description: description.trim() });
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{initialData ? '编辑应用' : '创建应用'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="app-name">应用名称</Label>
            <Input
              id="app-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="例如：智能客服助手"
              disabled={submitting}
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label>应用图标</Label>
            <div className="flex items-center gap-2 flex-wrap">
              {ICON_OPTIONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`w-9 h-9 rounded-lg border text-lg inline-flex items-center justify-center transition-colors ${
                    icon === ic
                      ? 'border-accent bg-accent/15'
                      : 'border-border bg-bg-2 hover:bg-bg-hover'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="app-desc">应用介绍</Label>
            <Textarea
              id="app-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述应用的功能和用途..."
              rows={3}
              disabled={submitting}
            />
          </div>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-error/10 text-error text-xs">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {initialData ? '保存' : '创建'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Studio/CreateAppDialog.tsx
git commit -m "feat: add create app dialog with icon picker"
```

---

### Task 9: App Config Page (Left Panel)

**Files:**
- Create: `frontend/src/pages/Studio/AppConfigPage.tsx`

- [ ] **Step 1: Create AppConfigPage**

```typescript
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStudioStore } from '@/store/useStudioStore';
import { useAuthStore } from '@/store/useAuthStore';
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
  ArrowLeftFromLine,
  Save,
  Trash2,
  LayoutGrid,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { App } from '@/types';

export const AppConfigPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const apps = useStudioStore((s) => s.apps);
  const loadApps = useStudioStore((s) => s.loadApps);
  const updateApp = useStudioStore((s) => s.updateApp);
  const deleteApp = useStudioStore((s) => s.deleteApp);
  const toggleStatus = useStudioStore((s) => s.toggleStatus);
  const currentUser = useAuthStore((s) => s.currentUser);

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
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Studio/AppConfigPage.tsx
git commit -m "feat: add app config page with left panel"
```

---

### Task 10: Studio Chat Preview (Right Panel)

**Files:**
- Create: `frontend/src/pages/Studio/StudioChatPreview.tsx`

- [ ] **Step 1: Create StudioChatPreview**

```typescript
import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send } from 'lucide-react';
import { api } from '@/lib/api';

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

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    const q = input.trim();
    if (!q || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInput('');
    setSending(true);
    setError('');

    try {
      // TODO: Replace with actual app chat endpoint when backend implements it
      // For now, show a placeholder response
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `已收到消息。当前配置：Provider=${config.provider}, Model=${config.model}` },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setSending(false);
    }
  };

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
            <div className={`max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent text-white rounded-br-md'
                : 'bg-bg-2 border border-border text-text rounded-bl-md'
            }`}>
              {msg.content}
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
git commit -m "feat: add chat preview panel for app testing"
```

---

### Task 11: App Chat Endpoint (Backend)

**Files:**
- Modify: `backend/app/routers/apps.py` (add chat endpoint)

- [ ] **Step 1: Add chat endpoint to apps router**

Add import at top:
```python
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from ..providers import get_current
from ..models import KnowledgeBase
from ..rag import vectorstore
```

Add endpoint before the closing of the router:

```python
@router.post("/{app_id}/chat")
def chat_with_app(
    app_id: int,
    payload: schemas.AppChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """使用应用的配置进行聊天测试。从 app 的 config_json 读取模型/提示词/知识库。"""
    app = get_app_or_404(app_id, db, current_user)
    config = json.loads(app.config_json or "{}")

    system_prompt = config.get("prompt", "") or "你是一个有用的 AI 助手。"
    kb_ids = config.get("kb_ids", [])

    # 组装知识库上下文
    context_parts = []
    for kb_id in kb_ids:
        kb = db.get(KnowledgeBase, kb_id)
        if kb is None or (current_user.role != "admin" and kb.owner_id != current_user.id):
            continue
        try:
            retrieved = vectorstore.search(
                db, kb_id=kb.id, query=payload.question, top_k=3,
                chunk_method=kb.chunk_method or "general_auto",
            )
            for chunk, score in retrieved:
                context_parts.append(f"[{chunk.document.filename if chunk.document else ''}] {chunk.content}")
        except Exception:
            pass

    full_prompt = system_prompt
    if context_parts:
        full_prompt += "\n\n参考资料：\n" + "\n\n".join(context_parts)

    # 调用 LLM
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

Also add import for `KnowledgeBase` if not already present.

- [ ] **Step 2: Verify build**

Run: `cd backend && python -c "from app.routers.apps import router; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/apps.py
git commit -m "feat: add app chat endpoint"
```

---

### Task 12: Update Frontend Chat Preview to Use Real Endpoint

**Files:**
- Modify: `frontend/src/pages/Studio/StudioChatPreview.tsx`

- [ ] **Step 1: Replace mock with real API call**

Replace the `handleSend` try block:

```typescript
    try {
      const result = await api.chatWithApp(appId, q);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: result.answer },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败');
    } finally {
      setSending(false);
    }
```

- [ ] **Step 2: Add chatWithApp to api.ts**

Add interface near other response types:

```typescript
export interface ChatAppResponse {
  answer: string;
}
```

Add method to api object:

```typescript
  /** 应用聊天测试 */
  chatWithApp: async (appId: number, question: string): Promise<ChatAppResponse> => {
    return request<ChatAppResponse>(`/api/apps/${appId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
  },
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Studio/StudioChatPreview.tsx frontend/src/lib/api.ts
git commit -m "feat: connect chat preview to backend endpoint"
```

---

### Task 13: Integration Test — End-to-End Workflow

- [ ] **Step 1: Start backend**

Run: `cd backend && uvicorn app.main:app --reload --port 8000`
Expected: Server running

- [ ] **Step 2: Start frontend**

Run: `cd frontend && npm run dev`
Expected: Dev server running

- [ ] **Step 3: Create an app via API**

```bash
curl -s -X POST http://localhost:8000/api/apps \
  -H "Content-Type: application/json" \
  -b "token=<get a token first>" \
  -d '{"name":"测试助手","icon":"🤖","description":"这是一个测试"}'
```

- [ ] **Step 4: List apps**

```bash
curl -s http://localhost:8000/api/apps
```

Expected: Returns array with the created app

- [ ] **Step 5: Verify frontend renders**

Open `http://localhost:5173/studio` (logged in)
Expected: Studio page loads, shows app card, clicking navigates to config page

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete studio module"
```
