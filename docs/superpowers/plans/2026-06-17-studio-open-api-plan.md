# Studio Open API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Open API toggle to Studio app config page and expose public REST endpoints (conversations CRUD + SSE streaming chat) authenticated via API Key.

**Architecture:** New `api_enabled` column on `App` model. New `public_api.py` router under `/api/public` with `X-API-Key` auth. Core chat logic extracted from `apps.py` into a shared `chat_service.py`.

**Tech Stack:** FastAPI, SQLAlchemy, LangChain, SSE streaming, React + shadcn/ui

---

## File Structure

### Backend
- `backend/app/models.py` — add `api_enabled` column to App
- `backend/app/schemas.py` — add `api_enabled` to AppUpdate/AppOut
- `backend/app/database.py` — add migration for `api_enabled` column
- `backend/app/routers/public_api.py` — NEW: all 4 public endpoints + `verify_api_key` dep
- `backend/app/services/chat_service.py` — NEW: shared chat logic extracted from apps.py
- `backend/app/routers/apps.py` — refactor chat endpoint to use shared service
- `backend/app/main.py` — register public_api router

### Frontend
- `frontend/src/pages/Studio/AppConfigPage.tsx` — add Open API toggle section
- `frontend/src/lib/api.ts` — update `updateApp` type to support `api_enabled`

---

### Task 1: Add `api_enabled` to App model + schema + migration

**Files:**
- Modify: `backend/app/models.py` — add column
- Modify: `backend/app/schemas.py` — add field to AppUpdate, AppOut, _to_out
- Modify: `backend/app/database.py` — add migration
- Modify: `backend/app/routers/apps.py` — add api_enabled to _to_out + update handler

- [ ] **Step 1: Add column to App model**

In `backend/app/models.py`, add `api_enabled` after `status`:

```python
api_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
```

Add `Boolean` to the SQLAlchemy imports at the top of the file (or ensure it's imported — `Boolean` may already be available via `from sqlalchemy import ...`).

- [ ] **Step 2: Add `api_enabled` to schemas**

In `backend/app/schemas.py`, modify:

`AppUpdate` — add field:
```python
api_enabled: bool | None = None
```

`AppOut` — add field:
```python
api_enabled: bool = False
```

- [ ] **Step 3: Update `_to_out` in apps.py**

In `backend/app/routers/apps.py:_to_out()`, add:
```python
"api_enabled": app.api_enabled,
```

- [ ] **Step 4: Handle `api_enabled` in PATCH handler**

In `backend/app/routers/apps.py:update_app()`, add after the `config_json` block:
```python
if payload.api_enabled is not None:
    app.api_enabled = payload.api_enabled
```

- [ ] **Step 5: Add migration in database.py**

In `backend/app/database.py:_migrate_add_columns()`, add:
```python
_ensure_column(cursor, "apps", "api_enabled", "BOOLEAN DEFAULT 0")
```

- [ ] **Step 6: Verify**

Run: `& "D:\webSite\project\transformer\backend\.venv\Scripts\python.exe" -c "from app.models import App; from app.schemas import AppUpdate, AppOut; print('OK')"`
Expected: `OK`

---

### Task 2: Extract shared chat service

**Files:**
- Create: `backend/app/services/__init__.py` — empty init
- Create: `backend/app/services/chat_service.py` — shared chat logic
- Modify: `backend/app/routers/apps.py` — refactor to use chat_service

- [ ] **Step 1: Create `backend/app/services/__init__.py`**

Empty file.

- [ ] **Step 2: Create `backend/app/services/chat_service.py`**

Move the core chat logic from `apps.py:chat_with_app()` lines 155-238 into a function:

```python
"""Shared chat logic used by both internal and public API routers."""
import json
import traceback

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from sqlalchemy.orm import Session

from ..models import App, KnowledgeBase, Skill
from ..providers import get_current, get_current_embedding, get_provider
from ..rag import vectorstore


def chat_with_app_config(
    app: App,
    question: str,
    stream: bool,
    db: Session,
    messages: list | None = None,
    user_id: int | None = None,
) -> StreamingResponse | dict:
    """Execute a chat against the given app's configuration.

    Returns either a StreamingResponse (stream=True) or a dict {"answer": str}.
    user_id is used for RAG/skill ownership checks (pass the app owner's ID
    for public API calls).
    """
    config = json.loads(app.config_json or "{}")

    system_prompt = config.get("prompt", "") or "你是一个有用的 AI 助手。"
    kb_ids = config.get("kb_ids", [])

    # 组装知识库上下文
    context_parts = []
    for kb_id in kb_ids:
        kb = db.get(KnowledgeBase, kb_id)
        if kb is None:
            continue
        try:
            embeddings = get_current_embedding(db).get_embeddings()
            retrieved = vectorstore.search(
                db, kb_id=kb.id, query=question,
                embeddings_model=embeddings, top_k=3,
                chunk_method=kb.chunk_method or "general_auto",
            )
            for chunk, score in retrieved:
                context_parts.append(f"[{chunk.document.filename if chunk.document else ''}] {chunk.content}")
        except Exception:
            traceback.print_exc()

    full_prompt = system_prompt
    if context_parts:
        full_prompt += "\n\n参考资料：\n" + "\n\n".join(context_parts)

    # 技能拼接
    skill_ids = config.get("skill_ids", [])
    for sid in skill_ids:
        skill = db.get(Skill, sid)
        if skill:
            full_prompt = skill.content + "\n\n" + full_prompt

    # 获取 provider
    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)

    llm = provider.get_llm()

    # 构建消息列表
    chat_messages = [("system", "{system}")]
    if messages:
        for m in messages:
            role = "human" if m.role == "user" else "ai"
            chat_messages.append((role, m["content"] if isinstance(m, dict) else m.content))
    if question:
        chat_messages.append(("human", "{question}"))

    prompt = ChatPromptTemplate.from_messages(chat_messages)
    input_vars = {"system": full_prompt}
    if question:
        input_vars["question"] = question

    if stream:
        async def event_stream():
            chain = prompt | llm | StrOutputParser()
            try:
                async for chunk in chain.astream_events(input_vars, version="v1"):
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
            answer = chain.invoke(input_vars)
            return {"answer": answer}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")


def compress_conversation(
    app: App,
    messages: list,
    db: Session,
) -> dict:
    """Compress conversation history into a summary using the app's LLM."""
    config = json.loads(app.config_json or "{}")

    provider_name = config.get("provider", "")
    if provider_name:
        provider = get_provider(db, provider_name)
    else:
        provider = get_current(db)

    llm = provider.get_llm()

    conversation_text = ""
    for m in messages:
        role = "用户" if m.role == "user" else "助手"
        conversation_text += f"{role}: {m.content}\n\n"

    prompt = PromptTemplate.from_template(
        "请将以下对话压缩为简洁的中文摘要，保留所有关键信息和上下文关系。\n\n对话：\n{conversation}\n\n压缩摘要："
    )
    chain = prompt | llm | StrOutputParser()
    summary = chain.invoke({"conversation": conversation_text})
    return {"summary": summary}
```

- [ ] **Step 3: Refactor `apps.py` to use shared service**

Replace the body of `chat_with_app` and `compress_conversation` in `backend/app/routers/apps.py` to call the new service:

```python
from ..services.chat_service import chat_with_app_config, compress_conversation
```

`chat_with_app` body becomes:
```python
    app = get_app_or_404(app_id, db, current_user)
    return chat_with_app_config(
        app=app,
        question=payload.question,
        stream=payload.stream,
        db=db,
        messages=payload.messages,
        user_id=current_user.id,
    )
```

`compress_conversation` body becomes:
```python
    app = get_app_or_404(app_id, db, current_user)
    return compress_conversation(app=app, messages=payload.messages, db=db)
```

Remove unused imports from `apps.py`: `ChatPromptTemplate`, `PromptTemplate`, `StrOutputParser`, `KnowledgeBase`, `Skill`, `get_current`, `get_provider`, `vectorstore`, `json` (if no longer used elsewhere — json IS still used for config parsing in the route itself).

- [ ] **Step 4: Verify import**

Run: `& "D:\webSite\project\transformer\backend\.venv\Scripts\python.exe" -c "from app.services.chat_service import chat_with_app_config; print('OK')"`
Expected: `OK`

---

### Task 3: Create public API router

**Files:**
- Create: `backend/app/routers/public_api.py`

- [ ] **Step 1: Write `backend/app/routers/public_api.py`**

```python
"""Public REST API for Studio apps — authenticated via API Key (X-API-Key header).

All endpoints require the API key to belong to the app's owner and the app
to have api_enabled=True.
"""
from datetime import datetime
from hashlib import sha256

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import ApiKey, App, Conversation, Message
from ..services.chat_service import chat_with_app_config

router = APIRouter(prefix="/api/public", tags=["public"])


def _verify_api_key(
    app_id: int,
    api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> App:
    """Verify the API key and return the authorized App.

    Raises 401 if the key is missing, invalid, or the app is not enabled.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 X-API-Key header",
        )

    key_hash = sha256(api_key.encode()).hexdigest()
    api_key_obj = db.scalar(
        select(ApiKey).where(ApiKey.key_hash == key_hash)
    )
    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key 无效",
        )

    app = db.get(App, app_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="应用不存在")
    if app.owner_id != api_key_obj.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="应用不存在")
    if not app.api_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该应用未开放 API 访问",
        )

    api_key_obj.last_used_at = datetime.utcnow()
    db.commit()

    return app


@router.post("/apps/{app_id}/conversations", status_code=201)
def create_conversation(
    app_id: int,
    payload: schemas.ConversationCreate,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> schemas.ConversationOut:
    """Create a new conversation for the app (owned by the app's owner)."""
    conv = Conversation(
        app_id=app_id,
        title=payload.title or "",
        owner_id=app.owner_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return schemas.ConversationOut(
        id=conv.id,
        app_id=conv.app_id,
        title=conv.title,
        summary=conv.summary,
        message_count=conv.message_count,
        owner_id=conv.owner_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/apps/{app_id}/conversations/{conv_id}/messages")
def list_messages(
    app_id: int,
    conv_id: int,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> list[schemas.MessageOut]:
    """List all messages in a conversation."""
    conv = db.get(Conversation, conv_id)
    if not conv or conv.app_id != app_id or conv.owner_id != app.owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
    ).all()
    return messages


@router.delete("/apps/{app_id}/conversations/{conv_id}", status_code=204)
def delete_conversation(
    app_id: int,
    conv_id: int,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> None:
    """Delete a conversation."""
    conv = db.get(Conversation, conv_id)
    if not conv or conv.app_id != app_id or conv.owner_id != app.owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    db.delete(conv)
    db.commit()


@router.post("/apps/{app_id}/conversations/{conv_id}/chat")
def chat(
    app_id: int,
    conv_id: int,
    payload: schemas.AppChatRequest,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
):
    """Send a message and stream the response (SSE). Messages are persisted.

    The request body supports the same fields as the internal chat endpoint:
    {question, messages?} where messages is an optional array of prior
    {role, content} objects for multi-turn context.
    """
    conv = db.get(Conversation, conv_id)
    if not conv or conv.app_id != app_id or conv.owner_id != app.owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")

    result = chat_with_app_config(
        app=app,
        question=payload.question,
        stream=True,
        db=db,
        messages=payload.messages,
    )

    # If it's a StreamingResponse, wrap it to persist messages after streaming
    if isinstance(result, StreamingResponse):
        original_stream = result.body_iterator

        async def persist_and_stream():
            full_response = ""
            async for chunk_str in original_stream:
                yield chunk_str
                # Accumulate the full response text
                import json as _json
                for line in chunk_str.split("\n"):
                    if line.startswith("data: "):
                        try:
                            data = _json.loads(line[6:])
                            if "token" in data:
                                full_response += data["token"]
                        except _json.JSONDecodeError:
                            pass

            # Persist after stream completes
            now = datetime.utcnow()
            if payload.question:
                db.add(Message(
                    conversation_id=conv_id,
                    role="user",
                    content=payload.question,
                    token_count=0,
                    created_at=now,
                ))
            if full_response:
                db.add(Message(
                    conversation_id=conv_id,
                    role="assistant",
                    content=full_response,
                    token_count=0,
                    created_at=now,
                ))
            conv.message_count = (
                db.scalar(
                    select(func.count(Message.id))
                    .where(Message.conversation_id == conv_id)
                ) or 0
            )
            db.commit()

        return StreamingResponse(persist_and_stream(), media_type="text/event-stream")
    else:
        # Non-streaming (should not happen for public API but handle gracefully)
        if payload.question:
            db.add(Message(
                conversation_id=conv_id,
                role="user",
                content=payload.question,
                token_count=0,
                created_at=datetime.utcnow(),
            ))
        if "answer" in result:
            db.add(Message(
                conversation_id=conv_id,
                role="assistant",
                content=result["answer"],
                token_count=0,
                created_at=datetime.utcnow(),
            ))
        conv.message_count = (
            db.scalar(
                select(func.count(Message.id))
                .where(Message.conversation_id == conv_id)
            ) or 0
        )
        db.commit()
        return result
```

Note: need to add `from fastapi.responses import StreamingResponse` and `from sqlalchemy import func` at the top.

- [ ] **Step 2: Verify import**

Run: `& "D:\webSite\project\transformer\backend\.venv\Scripts\python.exe" -c "from app.routers.public_api import router; print('OK')"`
Expected: `OK`

---

### Task 4: Register public_api router in main.py

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add import and include_router**

In `backend/app/main.py`, add to the `from .routers import ...` block:
```python
public_api,
```

Add after the other `include_router` lines:
```python
app.include_router(public_api.router)
```

- [ ] **Step 2: Verify startup**

Run: `& "D:\webSite\project\transformer\backend\.venv\Scripts\python.exe" -c "from app.main import app; print('OK')"`
Expected: `OK`

---

### Task 5: Frontend — Open API toggle on AppConfigPage

**Files:**
- Modify: `frontend/src/pages/Studio/AppConfigPage.tsx`

- [ ] **Step 1: Add `apiEnabled` state**

After the existing state declarations (around line 57), add:
```typescript
const [apiEnabled, setApiEnabled] = useState(false);
```

In the `useEffect` that loads config (around line 81-90), add:
```typescript
setApiEnabled(app.api_enabled);
```

In the `handleSave` function, add `api_enabled` to the update payload:
```typescript
await updateApp(app.id, { name, icon, description, config_json: configJson, api_enabled: apiEnabled });
```

- [ ] **Step 2: Add toggle section to JSX**

After the Knowledge Bases section (after line 375), add:
```tsx
<Separator />
<div>
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
```

- [ ] **Step 3: Update `api.ts` types**

In `frontend/src/lib/api.ts`, update the `updateApp` method signature to accept `api_enabled`:
```typescript
updateApp: async (id: number, data: { name?: string; icon?: string; description?: string; config_json?: string; api_enabled?: boolean }): Promise<App> => {
```

No other changes needed since the backend already handles the field in the PATCH handler.

- [ ] **Step 4: Verify TypeScript**

Run: `Set-Location "D:\webSite\project\transformer\frontend"; npx tsc --noEmit`
Expected: No output (no errors)

---

### Self-Review Checklist

1. **Spec coverage:** All requirements from the design doc are covered:
   - App model: `api_enabled` column ✓ (Task 1)
   - Public API router with 4 endpoints ✓ (Task 3)
   - API Key auth via `X-API-Key` header ✓ (Task 3)
   - Chat logic shared between internal/public ✓ (Task 2)
   - Frontend toggle on AppConfigPage ✓ (Task 5)
   - Router registration in main.py ✓ (Task 4)
   - Database migration ✓ (Task 1)

2. **Placeholder scan:** No "TBD", "TODO", or incomplete code blocks. All implementation code is written inline.

3. **Type consistency:** 
   - `api_enabled` → `bool | None` in AppUpdate, `bool` in AppOut ✓
   - `_to_out` includes `api_enabled` ✓
   - Frontend `updateApp` accepts `api_enabled?: boolean` ✓

4. **Ambiguity check:** 
   - The `_verify_api_key` dependency returns the `App` object; all endpoints use `app: App = Depends(_verify_api_key)`. The app is the authorized context.
   - Conversation ownership: all public endpoints check `conv.owner_id == app.owner_id` using the verified app.
   - Message persistence in chat endpoint: messages are saved after streaming completes, inside the async generator wrapper.
