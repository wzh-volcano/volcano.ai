# Plugin System v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing model-provider plugin system with a general plugin framework supporting skill (declarative markdown) and extension (code) plugins.

**Architecture:** Backend adds `plugins/` package with unified registry, skill loader, and hook dispatcher alongside the existing `providers/` package. Frontend adds component registry and build-time scanner. New `plugin_extensions` DB table stores non-model plugins. Both management views merge in the Plugin Management page.

**Tech Stack:** Python FastAPI, SQLAlchemy, React 18 + TypeScript, Vite

---

## File Structure

```
backend/app/
├── plugins/                          # CREATE: new package
│   ├── __init__.py
│   ├── base.py                       # Plugin Protocol, SkillDef, PluginHooks
│   ├── registry.py                   # Unified plugin registry
│   ├── skill_loader.py               # Skill markdown parsing + injection
│   └── hooks.py                      # Hook dispatcher
├── models.py                         # MODIFY: add PluginExtension model
├── database.py                       # MODIFY: add plugin_extensions migration
├── services/
│   ├── plugin_loader.py              # MODIFY: parse new manifest fields
│   └── chat_service.py               # MODIFY: inject skills + dispatch hooks
├── routers/
│   ├── plugins.py                    # MODIFY: merge results from both tables
│   └── plugins_v2.py                 # CREATE: endpoints for extension plugins
├── schemas.py                        # MODIFY: add extension plugin schemas
├── main.py                           # MODIFY: init new registry + router
└── providers/
    └── registry.py                   # MODIFY: bridge to new registry

frontend/
├── src/
│   ├── types/index.ts                # MODIFY: add ExtensionPlugin type
│   ├── lib/
│   │   ├── api.ts                    # MODIFY: add extension plugin endpoints
│   │   └── plugin-registry.ts        # CREATE: component registry
│   ├── components/
│   │   └── PluginOutlet.tsx          # CREATE: mount point component
│   └── pages/Plugins/
│       └── PluginManagementPage.tsx   # MODIFY: category tabs, skill/extension panels
└── scripts/
    └── scan-plugin-components.js      # CREATE: build-time scanner
```

---

### Task 1: Plugin Base Types

**Files:**
- Create: `backend/app/plugins/__init__.py`
- Create: `backend/app/plugins/base.py`

- [ ] **Step 1: Create plugins `__init__.py`**

```python
# backend/app/plugins/__init__.py
```

- [ ] **Step 2: Create Plugin Protocol, SkillDef, PluginHooks**

```python
# backend/app/plugins/base.py
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol, runtime_checkable

from fastapi import APIRouter
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel


@runtime_checkable
class Plugin(Protocol):
    def name(self) -> str: ...
    def label(self) -> str: ...
    def category(self) -> str: ...
    def available(self) -> bool: ...

    # Optional hooks
    def get_skills(self) -> list[SkillDef]: ...
    def register_routes(self) -> APIRouter | None: ...
    def get_hooks(self) -> PluginHooks | None: ...
    def get_provider(self) -> Provider | None: ...


@runtime_checkable
class Provider(Protocol):
    """Existing provider interface, kept for backward compat."""
    def name(self) -> str: ...
    def label(self) -> str: ...
    def available(self) -> bool: ...
    def configured(self) -> bool: ...
    def get_llm(self) -> BaseChatModel: ...
    def get_embeddings(self) -> Embeddings: ...
    def list_models(self) -> list[str]: ...
    def config_fields(self) -> list[dict]: ...


@dataclass
class SkillDef:
    name: str
    plugin_name: str
    content: str
    match_mode: str = "keyword"       # "always" | "keyword"
    keywords: list[str] = field(default_factory=list)


@dataclass
class PluginHooks:
    pre_chat: Callable | None = None
    post_chat: Callable | None = None
```

---

### Task 2: PluginExtension ORM Model + Migration

**Files:**
- Modify: `backend/app/models.py`
- Modify: `backend/app/database.py`

- [ ] **Step 1: Add PluginExtension model to models.py**

Add after `ProviderConfig` class (line 142):

```python
class PluginExtension(Base):
    """非 model 类插件（skill / extension）。"""

    __tablename__ = "plugin_extensions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(128), default="")
    category: Mapped[str] = mapped_column(String(32), default="extension", index=True)
    source: Mapped[str] = mapped_column(String(16), default="uploaded")
    version: Mapped[str] = mapped_column(String(32), default="")
    skills_json: Mapped[str] = mapped_column(Text, default="{}")       # {"code-review": "源码审查指南", ...}
    hooks_json: Mapped[str] = mapped_column(Text, default="{}")        # {"pre_chat": "mod.path:fn", ...}
    frontend_json: Mapped[str] = mapped_column(Text, default="{}")     # {components, extension_points}
    installed: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=False)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
```

- [ ] **Step 2: Add migration in database.py**

In `_migrate_add_columns()`, add after the last `_ensure_column` call (after line 74):

```python
    # plugin_extensions 表
    _ensure_table(cursor, "plugin_extensions", """
        CREATE TABLE IF NOT EXISTS plugin_extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'extension',
            source TEXT NOT NULL DEFAULT 'uploaded',
            version TEXT NOT NULL DEFAULT '',
            skills_json TEXT NOT NULL DEFAULT '{}',
            hooks_json TEXT NOT NULL DEFAULT '{}',
            frontend_json TEXT NOT NULL DEFAULT '{}',
            installed BOOLEAN NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT 0,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
```

Add the helper function:

```python
def _ensure_table(cursor, table: str, create_sql: str) -> None:
    """Create table if it doesn't exist."""
    cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
    if not cursor.fetchone():
        cursor.execute(create_sql)
```

And import it at the top of `_migrate_add_columns`:

Add at line 48:
```python
    _remove_dropped_tables(cursor)
```

---

### Task 3: Extend plugin_loader for New Manifest Fields

**Files:**
- Modify: `backend/app/services/plugin_loader.py`

- [ ] **Step 1: Relax manifest validation for non-model plugins**

Change `_read_manifest` to make `entry` optional when `category != "model"`:

```python
# After line 51: for key in ("name", "label", "entry"):
# Change to:
    required_keys = ["name", "label"]
    category = manifest.get("category", "model")
    if category == "model":
        required_keys.append("entry")
    for key in required_keys:
        if key not in manifest:
            raise PluginError(f"manifest.json 缺少字段: {key}")
    if ":" not in manifest.get("entry", "dummy:dummy"):
        if category == "model":
            raise PluginError("entry 必须形如 'module:Class'")
    return manifest
```

- [ ] **Step 2: Preserve full manifest in the target directory**

After the manifest is validated, write the full manifest back to the target directory so the frontend scanner can read the `frontend` section:

No additional step needed — the manifest is already copied as part of the zip extraction.

---

### Task 4: Unified Plugin Registry

**Files:**
- Create: `backend/app/plugins/registry.py`
- Modify: `backend/app/providers/registry.py` (bridge)

- [ ] **Step 1: Create the unified registry**

```python
# backend/app/plugins/registry.py
from __future__ import annotations

import importlib
import json
from pathlib import Path
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import PluginExtension
from .base import Plugin


_PLUGINS: dict[str, tuple[type, str, str, str]] = {}
"""name -> (plugin_class, label, source, category)"""


def register_plugin(name: str, plugin_cls: type, label: str, source: str = "builtin", category: str = "model") -> None:
    _PLUGINS[name] = (plugin_cls, label, source, category)


def get_plugin(name: str) -> type | None:
    entry = _PLUGINS.get(name)
    return entry[0] if entry else None


def list_plugins(category: str | None = None) -> list[type]:
    if category:
        return [cls for cls, label, src, cat in _PLUGINS.values() if cat == category]
    return [cls for cls, _, _, _ in _PLUGINS.values()]


def register_builtin_providers() -> None:
    """Bridge existing builtin providers into new registry."""
    from ..providers.registry import _BUILTIN
    for name, (cls, label, module_path, category) in _BUILTIN.items():
        register_plugin(name, cls, label, "builtin", category)


def sync_extensions_to_db(db: Session) -> None:
    """Ensure plugin_extensions rows match loaded extension plugins."""
    existing = {pe.name: pe for pe in db.scalars(select(PluginExtension))}
    for name, (cls, label, source, category) in _PLUGINS.items():
        if category == "model":
            continue  # handled by providers registry
        if name in existing:
            continue
        db.add(PluginExtension(
            name=name,
            label=label,
            category=category,
            source=source,
        ))
    db.commit()
```

- [ ] **Step 2: Add bridge call in providers/registry.py**

In `providers/registry.py`, add at the end of `load_uploaded_plugins()` (before the return):

```python
    # Also register uploaded non-model plugins
    from ..plugins.registry import register_plugin
    for name, (cls, label, mp, source, category) in list(_REGISTRY.items()):
        if category != "model":
            register_plugin(name, cls, label, source, category)
```

---

### Task 5: Skill Loader

**Files:**
- Create: `backend/app/plugins/skill_loader.py`

- [ ] **Step 1: Create SkillInjector class**

```python
# backend/app/plugins/skill_loader.py
from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension
from .base import SkillDef

SKILLS_DIR = Path("data") / "plugins"


class SkillInjector:
    def load_from_plugin(self, plugin_name: str, skills_map: dict[str, str]) -> list[SkillDef]:
        """Read skills markdown from plugin's skills/ directory.

        skills_map: {"code-review": "skills/code-review.md"}
        """
        result = []
        plugin_dir = SKILLS_DIR / plugin_name
        for skill_name, rel_path in skills_map.items():
            md_file = plugin_dir / rel_path
            if not md_file.exists():
                continue
            content = md_file.read_text(encoding="utf-8")
            result.append(SkillDef(
                name=skill_name,
                plugin_name=plugin_name,
                content=content,
                match_mode="keyword",
                keywords=[],
            ))
        return result

    def get_enabled_skills(self, db: Session) -> list[SkillDef]:
        """Return all skills from active extension plugins."""
        rows = db.scalars(
            select(PluginExtension).where(
                PluginExtension.is_active.is_(True),
                PluginExtension.installed.is_(True),
            )
        ).all()

        skills: list[SkillDef] = []
        for row in rows:
            try:
                skills_map = json.loads(row.skills_json or "{}")
            except json.JSONDecodeError:
                continue
            if not skills_map:
                continue
            skills.extend(self.load_from_plugin(row.name, skills_map))
        return skills

    def match(self, query: str, skills: list[SkillDef]) -> list[str]:
        """Return skill content matching the query."""
        matched = []
        for skill in skills:
            if skill.match_mode == "always":
                matched.append(skill.content)
            elif skill.match_mode == "keyword":
                if any(kw.lower() in query.lower() for kw in skill.keywords):
                    matched.append(skill.content)
        return matched
```

---

### Task 6: Hook Dispatcher

**Files:**
- Create: `backend/app/plugins/hooks.py`

- [ ] **Step 1: Create HookDispatcher class**

```python
# backend/app/plugins/hooks.py
from __future__ import annotations

import importlib
import json
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PluginExtension


def _resolve_callable(dotted_path: str) -> Callable | None:
    """Resolve 'module.path:function' to callable."""
    try:
        mod_name, _, fn_name = dotted_path.partition(":")
        module = importlib.import_module(mod_name)
        return getattr(module, fn_name)
    except Exception:
        return None


class HookDispatcher:
    def get_enabled_hooks(self, db: Session) -> list[dict]:
        """Return hook definitions from active extension plugins."""
        rows = db.scalars(
            select(PluginExtension).where(
                PluginExtension.is_active.is_(True),
                PluginExtension.installed.is_(True),
            )
        ).all()

        hooks = []
        for row in rows:
            try:
                hooks_def = json.loads(row.hooks_json or "{}")
            except json.JSONDecodeError:
                continue
            hooks.append(hooks_def)
        return hooks

    def dispatch_pre_chat(self, query: str, context: dict, db: Session) -> tuple[str, dict]:
        """Call all pre_chat hooks in registered order."""
        hooks = self.get_enabled_hooks(db)
        for hook_def in hooks:
            path = hook_def.get("pre_chat")
            if not path:
                continue
            fn = _resolve_callable(path)
            if fn:
                try:
                    query, context = fn(query, context)
                except Exception:
                    pass
        return query, context

    def dispatch_post_chat(self, query: str, response: str, context: dict, db: Session) -> str:
        """Call all post_chat hooks in registered order."""
        hooks = self.get_enabled_hooks(db)
        for hook_def in hooks:
            path = hook_def.get("post_chat")
            if not path:
                continue
            fn = _resolve_callable(path)
            if fn:
                try:
                    response = fn(query, response, context)
                except Exception:
                    pass
        return response
```

---

### Task 7: Extension Plugin API Endpoints

**Files:**
- Create: `backend/app/routers/plugins_v2.py`
- Modify: `backend/app/schemas.py`

- [ ] **Step 1: Add schemas for extension plugins**

In `schemas.py`, add after `PluginInstallResponse`:

```python
class ExtensionPluginOut(BaseModel):
    id: int
    name: str
    label: str
    category: str
    source: str
    version: str
    skills_json: str | None = None
    hooks_json: str | None = None
    frontend_json: str | None = None
    installed: bool
    is_active: bool
    error: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExtensionPluginSkillUpdate(BaseModel):
    """Update skill keywords / match mode."""
    name: str
    keywords: list[str]
    match_mode: str = "keyword"
```

- [ ] **Step 2: Create the router**

```python
# backend/app/routers/plugins_v2.py
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_admin
from ..models import PluginExtension, User

router = APIRouter(prefix="/api/plugins/v2", tags=["plugins-v2"])


def _to_out(p: PluginExtension) -> schemas.ExtensionPluginOut:
    return schemas.ExtensionPluginOut(
        id=p.id,
        name=p.name,
        label=p.label,
        category=p.category,
        source=p.source,
        version=p.version or "",
        skills_json=maybe_load_json(p.skills_json),
        hooks_json=maybe_load_json(p.hooks_json),
        frontend_json=maybe_load_json(p.frontend_json),
        installed=p.installed,
        is_active=p.is_active,
        error=p.error,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def maybe_load_json(val: str | None) -> str | None:
    if not val:
        return None
    try:
        json.loads(val)
        return val
    except json.JSONDecodeError:
        return None


@router.get("", response_model=list[schemas.ExtensionPluginOut])
def list_extension_plugins(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[schemas.ExtensionPluginOut]:
    rows = db.scalars(
        select(PluginExtension).order_by(PluginExtension.id)
    ).all()
    return [_to_out(p) for p in rows]


@router.post("/{name}/install", response_model=schemas.ExtensionPluginOut)
def install_extension(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.ExtensionPluginOut:
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件加载失败：{row.error}")
    row.installed = True
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/{name}/activate", response_model=schemas.ExtensionPluginOut)
def activate_extension(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.ExtensionPluginOut:
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if not row.installed:
        raise HTTPException(status_code=400, detail="请先安装后再激活")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件存在错误：{row.error}")
    row.is_active = True
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/{name}/deactivate", response_model=schemas.ExtensionPluginOut)
def deactivate_extension(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.ExtensionPluginOut:
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    row.is_active = False
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/{name}/skills", response_model=schemas.ExtensionPluginOut)
def update_skill_config(
    name: str,
    payload: schemas.ExtensionPluginSkillUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.ExtensionPluginOut:
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")

    try:
        skills = json.loads(row.skills_json or "{}")
    except json.JSONDecodeError:
        skills = {}

    skill_entry = skills.get(payload.name)
    if skill_entry is None:
        raise HTTPException(status_code=404, detail=f"技能 {payload.name} 不存在")

    skill_entry["keywords"] = payload.keywords
    skill_entry["match_mode"] = payload.match_mode
    skills[payload.name] = skill_entry
    row.skills_json = json.dumps(skills, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{name}", status_code=204)
def delete_extension(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> None:
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")

    from ..services.plugin_loader import uninstall, PluginError
    try:
        uninstall(name)
    except PluginError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.delete(row)
    db.commit()
```

---

### Task 8: Wire Up in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Initialize plugins registry and add new router**

Change the imports (line 15-19) and lifespan:

```python
from .providers import (
    load_uploaded_plugins,
    sync_builtin_to_db,
    sync_uploaded_to_db,
)
from .plugins.registry import register_builtin_providers, sync_extensions_to_db
from .routers import (
    # ... existing imports, then add:
    plugins_v2,
)
```

In `seed_providers()` (after line 63), add:

```python
def seed_providers() -> None:
    db = SessionLocal()
    try:
        sync_builtin_to_db(db)
        results = load_uploaded_plugins()
        sync_uploaded_to_db(db, results)
        # NEW: bridge builtin providers + sync extensions
        register_builtin_providers()
        sync_extensions_to_db(db)
    finally:
        db.close()
```

Add router after `public_api.router` at line 100:

```python
app.include_router(plugins_v2.router)
```

---

### Task 9: Merge Plugin List API

**Files:**
- Modify: `backend/app/routers/plugins.py`

- [ ] **Step 1: Add unified plugin list schema**

In `schemas.py`, add:

```python
class PluginListItem(BaseModel):
    """Unified view for plugin list, merging model + extension plugins."""
    id: int
    name: str
    label: str
    category: str
    source: str
    installed: bool
    is_active: bool
    error: str | None = None
    created_at: str
    updated_at: str
```

- [ ] **Step 2: Extend list_plugins to include extension plugins**

Modify `list_plugins` (line 56-62) to merge results from both tables:

```python
@router.get("", response_model=list[schemas.PluginListItem])
def list_plugins(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[schemas.PluginListItem]:
    from ..models import PluginExtension

    model_rows = db.scalars(select(ProviderConfig).order_by(ProviderConfig.id)).all()
    ext_rows = db.scalars(select(PluginExtension).order_by(PluginExtension.id)).all()

    result: list[schemas.PluginListItem] = [_to_list_item(p) for p in model_rows]
    result.extend([_to_ext_list_item(p) for p in ext_rows])
    return result


def _to_list_item(p) -> schemas.PluginListItem:
    return schemas.PluginListItem(
        id=p.id, name=p.name, label=p.label,
        category=p.category or "model", source=p.source,
        installed=p.installed, is_active=p.is_active,
        error=p.error,
        created_at=p.created_at.isoformat() if p.created_at else "",
        updated_at=p.updated_at.isoformat() if p.updated_at else "",
    )


def _to_ext_list_item(p) -> schemas.PluginListItem:
    return schemas.PluginListItem(
        id=-p.id,  # negative to avoid id collision with provider_configs
        name=p.name, label=p.label,
        category=p.category, source=p.source,
        installed=p.installed, is_active=p.is_active,
        error=p.error,
        created_at=p.created_at.isoformat() if p.created_at else "",
        updated_at=p.updated_at.isoformat() if p.updated_at else "",
    )
```
```

---

### Task 10: Integrate Skills + Hooks into Chat Service

**Files:**
- Modify: `backend/app/services/chat_service.py`

- [ ] **Step 1: Inject skills and dispatch hooks in chat flow**

Add at the top of the file:

```python
from ..plugins.skill_loader import SkillInjector
from ..plugins.hooks import HookDispatcher

_skill_injector = SkillInjector()
_hook_dispatcher = HookDispatcher()
```

Modify `chat_with_app_config` (after line 27, before building system prompt):

```python
    config = json.loads(app.config_json or "{}")

    # ---- NEW: pre_chat hooks ----
    question, _ = _hook_dispatcher.dispatch_pre_chat(question, {}, db)

    system_prompt = config.get("prompt", "") or "你是一个有用的 AI 助手。"
    kb_ids = config.get("kb_ids", [])

    # ---- NEW: skill injection ----
    enabled_skills = _skill_injector.get_enabled_skills(db)
    if enabled_skills:
        matched = _skill_injector.match(question, enabled_skills)
        if matched:
            skill_section = "\n\n---\n## 技能指南\n\n" + "\n\n".join(matched)
            system_prompt += skill_section

    # ... rest of existing code ...

    # ---- NEW in return path (non-streaming) ----
    if not stream:
        chain = prompt | llm | StrOutputParser()
        try:
            answer = chain.invoke(input_vars)
            answer = _hook_dispatcher.dispatch_post_chat(question, answer, {}, db)
            return {"answer": answer}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")
```

For streaming, post_chat hooks are not applied (SSE stream can't be post-processed easily). Leave a comment:

```python
    # Note: post_chat hooks are not applied to SSE streams
```

---

### Task 11: Frontend Types + API Client Extensions

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add ExtensionPlugin type**

In `types/index.ts`, after the `Plugin` interface:

```typescript
export interface ExtensionPlugin {
  id: number;
  name: string;
  label: string;
  category: string;
  source: 'builtin' | 'uploaded';
  version: string;
  skillsJson: string | null;
  hooksJson: string | null;
  frontendJson: string | null;
  installed: boolean;
  isActive: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add API methods**

In `api.ts`, add:

```typescript
  // ---- Plugin Extension APIs ----
  async listExtensionPlugins(): Promise<ExtensionPlugin[]> {
    return this.get('/api/plugins/v2');
  }

  async installExtensionPlugin(name: string): Promise<ExtensionPlugin> {
    return this.post(`/api/plugins/v2/${name}/install`);
  }

  async activateExtensionPlugin(name: string): Promise<ExtensionPlugin> {
    return this.post(`/api/plugins/v2/${name}/activate`);
  }

  async deactivateExtensionPlugin(name: string): Promise<ExtensionPlugin> {
    return this.post(`/api/plugins/v2/${name}/deactivate`);
  }

  async deleteExtensionPlugin(name: string): Promise<void> {
    return this.delete(`/api/plugins/v2/${name}`);
  }
```

Add import for `ExtensionPlugin`:

```typescript
import type { ..., ExtensionPlugin } from '@/types';
```

---

### Task 12: Frontend Component Registry + PluginOutlet

**Files:**
- Create: `frontend/src/lib/plugin-registry.ts`
- Create: `frontend/src/components/PluginOutlet.tsx`

- [ ] **Step 1: Create component registry**

```typescript
// frontend/src/lib/plugin-registry.ts
import React from 'react';

export interface PluginComponent {
  key: string;
  pluginName: string;
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  extensionPoint: string;
}

const registry = new Map<string, PluginComponent[]>();

export function registerPluginComponent(comp: PluginComponent): void {
  const list = registry.get(comp.extensionPoint) || [];
  list.push(comp);
  registry.set(comp.extensionPoint, list);
}

export function getPluginComponents(point: string, pluginName?: string): PluginComponent[] {
  const list = registry.get(point) || [];
  if (pluginName) {
    return list.filter(c => c.pluginName === pluginName);
  }
  return list;
}

export function clearPluginComponents(pluginName: string): void {
  for (const [point, list] of registry.entries()) {
    registry.set(point, list.filter(c => c.pluginName !== pluginName));
  }
}
```

- [ ] **Step 2: Create PluginOutlet component**

```typescript
// frontend/src/components/PluginOutlet.tsx
import React, { Suspense } from 'react';
import { getPluginComponents } from '@/lib/plugin-registry';
import { Loader2 } from 'lucide-react';

interface PluginOutletProps {
  extensionPoint: string;
  pluginName?: string;
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-4 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin mr-2" />
      <span className="text-sm">加载插件中...</span>
    </div>
  );
}

export function PluginOutlet({ extensionPoint, pluginName }: PluginOutletProps) {
  const components = getPluginComponents(extensionPoint, pluginName);

  if (components.length === 0) return null;

  return (
    <>
      {components.map(comp => (
        <Suspense key={`${comp.pluginName}-${comp.key}`} fallback={<Loading />}>
          <comp.component pluginName={comp.pluginName} />
        </Suspense>
      ))}
    </>
  );
}
```

---

### Task 13: Build-Time Scanner

**Files:**
- Create: `scripts/scan-plugin-components.js`
- Modify: `frontend/package.json`

- [ ] **Step 1: Create the scanner script**

```javascript
// scripts/scan-plugin-components.js
// Run from frontend/ before vite build: scans data/plugins/*/frontend/ for components
// Uses CommonJS because the project root has no "type": "module"
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_DIR = process.cwd();
const PROJECT_ROOT = path.resolve(FRONTEND_DIR, '..');
const PLUGINS_DIR = path.resolve(PROJECT_ROOT, 'data', 'plugins');
const OUTPUT_FILE = path.resolve(FRONTEND_DIR, 'src', 'plugin-components.generated.ts');

function scan() {
  const imports = [];
  const registrations = [];

  if (!fs.existsSync(PLUGINS_DIR)) {
    writeOutput(imports, registrations);
    return;
  }

  for (const pluginDir of fs.readdirSync(PLUGINS_DIR)) {
    const manifestPath = path.join(PLUGINS_DIR, pluginDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      const frontendConfig = manifest.frontend;
      if (!frontendConfig?.components) continue;

      for (const [key, componentName] of Object.entries(frontendConfig.components)) {
        const componentPath = path.join(PLUGINS_DIR, pluginDir, 'frontend', `${componentName}.tsx`);
        if (!fs.existsSync(componentPath)) {
          console.warn(`[scan-plugin] Warning: ${componentPath} not found, skipping`);
          continue;
        }

        const extPoints = frontendConfig.extension_points || ['plugin-config-tab'];
        for (const extPoint of extPoints) {
          const varName = `${pluginDir}_${key}`.replace(/[^a-zA-Z0-9_]/g, '_');
          const relPath = `../data/plugins/${pluginDir}/frontend/${componentName}`;
          imports.push(`const ${varName} = lazy(() => import('${relPath}'));`);
          registrations.push(
            `registerPluginComponent({ key: '${key}', pluginName: '${pluginDir}', component: ${varName}, extensionPoint: '${extPoint}' });`
          );
        }
      }
    } catch (err) {
      console.warn(`[scan-plugin] Error reading ${manifestPath}:`, err.message);
    }
  }

  writeOutput(imports, registrations);
}

function writeOutput(imports, registrations) {
  const content = `// Auto-generated by scripts/scan-plugin-components.js
// Do not edit manually.
import { lazy } from 'react';
import { registerPluginComponent } from './lib/plugin-registry';

${imports.join('\n')}

${registrations.join('\n')}
`;
  fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
  console.log(`[scan-plugin] Generated ${OUTPUT_FILE} with ${imports.length} components`);
}

scan();
```

- [ ] **Step 2: Add scanner as prebuild step**

In `frontend/package.json`, modify the build script:

```json
  "scripts": {
    "dev": "node ../scripts/scan-plugin-components.js && vite",
    "build": "node ../scripts/scan-plugin-components.js && tsc && vite build",
    "preview": "vite preview",
    "check": "tsc --noEmit"
  },
```

- [ ] **Step 3: Create initial empty generated file**

Create `frontend/src/plugin-components.generated.ts` with:

```typescript
// Auto-generated by scripts/scan-plugin-components.js
// Do not edit manually.
import { lazy } from 'react';
import { registerPluginComponent } from './lib/plugin-registry';
```

- [ ] **Step 4: Import generated file in main.tsx**

Add at the top of `frontend/src/main.tsx`:

```typescript
import './plugin-components.generated';
```

---

### Task 14: Plugin Management UI

**Files:**
- Modify: `frontend/src/pages/Plugins/PluginManagementPage.tsx`

- [ ] **Step 1: Add category tabs**

After the existing state declarations (around line 80), add:

```typescript
type TabFilter = 'all' | 'model' | 'skill' | 'extension';
const [tabFilter, setTabFilter] = useState<TabFilter>('all');
```

Add tab bar after the header section:

```tsx
<div className="flex gap-2 mb-4 border-b pb-2">
  {(['all', 'model', 'skill', 'extension'] as const).map(tab => (
    <button
      key={tab}
      onClick={() => setTabFilter(tab)}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        tabFilter === tab
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent'
      }`}
    >
      {tab === 'all' ? '全部' : tab === 'model' ? '模型' : tab === 'skill' ? '技能' : '扩展'}
    </button>
  ))}
</div>
```

- [ ] **Step 2: Filter plugins by category**

Modify the `plugins.map` rendering to filter:

```typescript
const filteredPlugins = useMemo(() => {
  if (tabFilter === 'all') return plugins;
  return plugins.filter(p => p.category === tabFilter);
}, [plugins, tabFilter]);
```

Replace `plugins.map(` with `filteredPlugins.map(`.

- [ ] **Step 3: Add skill detail panel**

For `category === "skill"` plugins, show skill files list in the detail section. Add inside the plugin card render:

```tsx
{plugin.category === 'skill' && plugin.skillsJson && (
  <div className="mt-2 space-y-1">
    <p className="text-xs font-medium text-muted-foreground">技能文件：</p>
    {Object.entries(JSON.parse(plugin.skillsJson)).map(([name, desc]) => (
      <div key={name} className="flex items-center gap-2 text-sm px-2 py-1 bg-muted/50 rounded">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span>{name}</span>
        <span className="text-muted-foreground text-xs">— {desc}</span>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Show extension points for extension plugins**

```tsx
{plugin.category === 'extension' && plugin.frontendJson && (
  <div className="mt-2 space-y-1">
    <p className="text-xs font-medium text-muted-foreground">挂载点：</p>
    {(() => {
      try {
        const frontend = JSON.parse(plugin.frontendJson);
        return frontend.extension_points?.map((ep: string) => (
          <span key={ep} className="inline-block text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded mr-1">{ep}</span>
        ));
      } catch { return null; }
    })()}
  </div>
)}
```

- [ ] **Step 5: Add activation toggle for extension plugins**

In the action buttons section, add:

```tsx
{plugin.category !== 'model' && (
  <>
    {plugin.installed && (
      <DropdownMenuItem onClick={() => handleToggleActive(plugin)}>
        <Power className="h-4 w-4 mr-2" />
        {plugin.isActive ? '停用' : '激活'}
      </DropdownMenuItem>
    )}
    <DropdownMenuSeparator />
  </>
)}
```

---

### Task 15: Backward Compatibility Bridge

**Files:**
- Modify: `backend/app/providers/registry.py`
- Modify: `frontend/src/lib/api.ts` (new Plugin API mapper)

- [ ] **Step 1: Ensure old Plugin protocol still works**

The existing `Provider` Protocol in `providers/base.py` is unchanged. The new `Plugin` Protocol in `plugins/base.py` has `get_provider()` as an optional hook. For backward compat, wrap old providers as plugins:

In `providers/registry.py`, add at the end:

```python
# Wrap old Provider as Plugin for backward compatibility
from ..plugins.registry import register_plugin

# In _BUILTIN init, already called from main.py seed_providers()
```

This is already handled in Task 4 by `register_builtin_providers()`.

- [ ] **Step 2: Frontend API mapping**

In `api.ts`, the `listPlugins()` method already returns the merged list (Task 9). Add a mapper to normalize both types:

```typescript
function normalizePlugin(item: any): Plugin | ExtensionPlugin {
  if (item.category === 'model') {
    return item as Plugin;
  }
  return {
    ...item,
    // Ensure consistent shape
  } as ExtensionPlugin;
}
```

Not strictly necessary — the UI uses the raw API response shape directly.

---

### Task 16: E2E Verification

**Files:**
- Test: manual verification steps

- [ ] **Step 1: Start backend**

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

Verify logs show:
- "plugin_extensions table created"
- Builtin providers registered in new registry

- [ ] **Step 2: Test skill plugin via API**

Create a test skill plugin zip:

```bash
mkdir /tmp/test-skill-plugin
cat > /tmp/test-skill-plugin/manifest.json << 'EOF'
{
  "name": "test-skill",
  "label": "测试技能包",
  "version": "1.0.0",
  "category": "skill",
  "skills": {
    "polite": "skills/polite.md"
  }
}
EOF
mkdir -p /tmp/test-skill-plugin/skills
cat > /tmp/test-skill-plugin/skills/polite.md << 'EOF'
请始终使用礼貌用语，称呼用户为"您"。
EOF
cd /tmp && zip -r test-skill-plugin.zip test-skill-plugin/
```

Upload via API:

```bash
curl -X POST http://localhost:8000/api/plugins/upload \
  -F "file=@/tmp/test-skill-plugin.zip" \
  -H "Authorization: Bearer $TOKEN"
```

Then install and activate:

```bash
curl -X POST http://localhost:8000/api/plugins/v2/test-skill/install \
  -H "Authorization: Bearer $TOKEN"
curl -X POST http://localhost:8000/api/plugins/v2/test-skill/activate \
  -H "Authorization: Bearer $TOKEN"
```

Verify skill injection:

```bash
# Check that GET /api/plugins includes the new plugin
curl http://localhost:8000/api/plugins \
  -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 3: Start frontend**

```bash
cd frontend
npm run dev
```

Verify:
- Plugin Management page shows category tabs
- Test skill plugin appears in "技能" tab
- Frontend builds without errors (generated components file compiles)

- [ ] **Step 4: Verify backward compatibility**

Ensure existing model plugins (deepseek, qwen) still appear in "模型" tab and function normally.

- [ ] **Step 5: Run existing tests**

```bash
cd backend
python -m pytest test_plugins_e2e.py -v
```
