# Studio Open API — Design Doc

Date: 2026-06-17

## Overview

Enable Studio apps to be accessed via a public REST API. App owners can toggle "Open API" on the app config page, and external clients can then create conversations and get streaming model responses using an API Key.

## Architecture

```
External Client                     Volcano AI Backend
       │                                   │
       │  POST /api/public/apps/1/chat      │
       │  X-API-Key: vol_xxx...             │
       │─────────────────────────────────▶  │
       │                                   │  public_api.py router
       │                                   │  ├─ verify API Key against api_keys table
       │                                   │  ├─ check app.api_enabled == True
       │                                   │  ├─ check key belongs to app.owner_id
       │                                   │  ├─ call shared chat logic
       │                                   │  └─ StreamingResponse (SSE)
       │  data: {"token":"Hello"}           │
       │  data: {"token":" world"}          │
       │  data: {"done":true}               │
       │◀─────────────────────────────────  │
```

## Changes

### 1. App Model — New Column

File: `backend/app/models.py`

Add `api_enabled: Mapped[bool] = mapped_column(Boolean, default=False)` to the `App` model.

### 2. New Public API Router

File: `backend/app/routers/public_api.py`

New module for all public-facing endpoints, prefix `/api/public`.

#### Authentication Dependency

```python
def verify_api_key(
    app_id: int,
    api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> App:
```

Logic:
1. If `X-API-Key` header is missing, return 401
2. Compute SHA-256 hash of the provided key
3. Look up `api_keys` table by `key_hash`
4. Find the app by `app_id`, verify `app.owner_id == api_key.user_id`
5. Verify `app.api_enabled == True`
6. Update `api_key.last_used_at` to now
7. Return the App object (caller gets `app` and implicitly has the authorized user context)

#### Endpoints

| Method | Path | Request | Response | Description |
|--------|------|---------|----------|-------------|
| POST | `/api/public/apps/{app_id}/conversations` | `{title?: string}` | `{id, title, created_at}` | Create a new conversation (owner_id = app.owner_id) |
| GET | `/api/public/apps/{app_id}/conversations/{conv_id}/messages` | — | `[{role, content, token_count, created_at}]` | List all messages in a conversation |
| DELETE | `/api/public/apps/{app_id}/conversations/{conv_id}` | — | 204 | Delete a conversation |
| POST | `/api/public/apps/{app_id}/conversations/{conv_id}/chat` | `{question: string, messages?: {role, content}[]}` | SSE stream (`data: {"token":"..."} / {"done":true}`) | Send a message and stream the response |

#### Chat Endpoint Implementation

Reuse the core chat logic from `apps.py`:

1. Extract the app config from `app.config_json`
2. Retrieve skills, RAG context from KBs (same as internal chat)
3. Read conversation history (last N messages for context)
4. Build messages array: system prompt + history + new question
5. Call LLM via LangChain's `astream_events`
6. After streaming completes, persist `question` and `response` as Message records

Refactor: Extract the chat logic (lines ~150-238 of `apps.py`) into a shared function in a new module (`backend/app/services/chat_service.py` or similar) used by both `apps.py` and `public_api.py`.

### 3. Frontend — AppConfigPage Toggle

File: `frontend/src/pages/Studio/AppConfigPage.tsx`

- Add `apiEnabled` state (loaded from `app.configJson` or new field)
- Add a toggle section after "Knowledge Bases" section:

```
┌─────────────────────────┐
│ Open API                │
│ [Toggle] 启用开放 API   │
│                         │
│ 开启后可通过 API Key    │
│ 访问此应用的对话接口    │
└─────────────────────────┘
```

- The toggle value is saved into `app.api_enabled` via the existing PATCH `/api/apps/{app_id}` endpoint (add `api_enabled: bool` to the request schema)

### 4. Database Migration

Add `api_enabled` column to `database.py:_migrate_add_columns()`:

```python
_ensure_column(cursor, "apps", "api_enabled", "BOOLEAN DEFAULT 0")
```

## Authentication Flow (detail)

```
Client                                    Server
  │                                        │
  │  POST /api/public/apps/1/conversations │
  │  X-API-Key: vol_abc123...              │
  │──────────────────────────────────────▶  │
  │                                        │── verify_api_key()
  │                                        │    ├─ sha256(vol_abc123...) → hash
  │                                        │    ├─ SELECT * FROM api_keys WHERE key_hash=hash
  │                                        │    ├─ App.owner_id == ApiKey.user_id ?
  │                                        │    ├─ App.api_enabled == True ?
  │                                        │    └─ UPDATE last_used_at
  │                                        │── create conversation
  │  {id: 5, title: "", created_at: ...}   │
  │◀──────────────────────────────────────  │
```

## Security Considerations

- API Key is transmitted in plaintext via `X-API-Key` header → **must use HTTPS in production**
- Key is hashed with SHA-256 at rest; full key is only shown once at creation
- Each request re-validates `app.api_enabled`, so toggling off immediately revokes access
- Conversation ownership is tied to app owner, so API callers cannot access conversations created by other API users of the same app (nor can they access the app owner's UI conversations)
- Rate limiting: not in scope of this design (can be added later via middleware)

## Files Changed

### Backend
- `backend/app/models.py` — add `api_enabled` to App
- `backend/app/schemas.py` — add `ApiEnabledUpdate` schema
- `backend/app/database.py` — add migration for `api_enabled` column
- `backend/app/routers/public_api.py` — NEW, all public endpoints
- `backend/app/services/chat_service.py` — NEW, shared chat logic
- `backend/app/routers/apps.py` — refactor to use shared chat service
- `backend/app/main.py` — register public_api router

### Frontend
- `frontend/src/pages/Studio/AppConfigPage.tsx` — add Open API toggle
- `frontend/src/lib/api.ts` — add `updateAppApiEnabled` method (if not already covered by generic updateApp)
