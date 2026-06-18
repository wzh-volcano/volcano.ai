# MCP Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add MCP (Model Context Protocol) support — user-uploadable MCP Server plugins + built-in system MCP Server — connected via LangChain tool calling agent.

**Architecture:** Independent MCP Server plugin processes spawned as subprocesses via stdio transport. MCPClientManager aggregates tools from all active plugins. `chat_service.py` uses `AgentExecutor` with `bind_tools` when tools are available, falls back to current pipeline when none are.

**Tech Stack:** `mcp` (MCP Python SDK), LangChain `create_tool_calling_agent` + `AgentExecutor`, `asyncio.subprocess`

---

### File Structure

```
backend/
  app/
    mcp/
      __init__.py
      client_manager.py      # MCPClientManager: spawn, connect, aggregate tools
      builtin_server.py      # Built-in MCP Server script (knowledge_search, skill_get_guide)
    models/__init__.py       # Add McpServerPlugin type enum
    routers/plugins_v2.py    # Support type="mcp_server" upload/activate/deactivate
    services/chat_service.py # AgentExecutor integration
    main.py                  # Lifespan: init MCPClientManager
frontend/
  src/pages/Plugins/
    PluginManagementPage.tsx  # Upload type selection, MCP card state display
```

---

### Task 0: Dependencies

- [ ] **Step 1: Install MCP SDK**

Run: `pip install mcp`

Verify: `python -c "import mcp; print(mcp.__version__)"` shows a version.

- [ ] **Step 2: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add mcp dependency"
```

---

### Task 1: MCPClientManager

**Files:**
- Create: `backend/app/mcp/__init__.py`
- Create: `backend/app/mcp/client_manager.py`

- [ ] **Step 1: Create `__init__.py`**

```python
# backend/app/mcp/__init__.py
```

- [ ] **Step 2: Create `client_manager.py`**

```python
# backend/app/mcp/client_manager.py
import asyncio
import json
import logging
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from langchain_core.tools import BaseTool, tool

logger = logging.getLogger(__name__)


class McpServerInfo:
    name: str
    session: ClientSession | None = None
    tools: list[dict] = []
    proc: asyncio.subprocess.Process | None = None
    entry: str = ""
    env: dict = {}


class MCPClientManager:
    def __init__(self):
        self._servers: dict[str, McpServerInfo] = {}

    async def start_plugin(self, name: str, entry: str, env: dict | None = None) -> list[dict]:
        """Spawn the MCP Server plugin as a subprocess and connect via stdio.

        Returns the list of tool definitions from the server.
        """
        info = McpServerInfo(name=name, entry=entry, env=env or {})

        params = StdioServerParameters(
            command="python",
            args=[entry],
            env={**env} if env else None,
        )

        read, write = await stdio_client(params).__aenter__()
        session = await ClientSession(read, write).__aenter__()
        await session.initialize()

        info.session = session
        result = await session.list_tools()
        info.tools = [{"name": t.name, "description": t.description, "inputSchema": t.inputSchema} for t in result.tools]
        self._servers[name] = info
        logger.info("MCP plugin %s started with %d tools", name, len(info.tools))
        return info.tools

    async def stop_plugin(self, name: str):
        """Disconnect and kill the plugin subprocess."""
        info = self._servers.pop(name, None)
        if info is None:
            return
        if info.session:
            await info.session.__aexit__(None, None, None)
        if info.proc:
            info.proc.kill()
            await info.proc.wait()
        logger.info("MCP plugin %s stopped", name)

    def get_all_tools(self) -> list[BaseTool]:
        """Aggregate all activated plugin tools as LangChain BaseTool instances."""
        result: list[BaseTool] = []
        for name, info in self._servers.items():
            for t_def in info.tools:

                @tool(t_def["name"], description=t_def["description"])
                async def run_tool(**kwargs: Any) -> str:
                    session = self._servers[name].session
                    if session is None:
                        return "Error: server not connected"
                    try:
                        resp = await session.call_tool(t_def["name"], kwargs)
                        return json.dumps([c.text for c in resp.content if hasattr(c, "text")], ensure_ascii=False)
                    except Exception as e:
                        return f"Error calling tool {t_def['name']}: {e}"

                result.append(run_tool)
        return result

    async def stop_all(self):
        for name in list(self._servers):
            await self.stop_plugin(name)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/mcp/
git commit -m "feat(mcp): add MCPClientManager"
```

---

### Task 2: Built-in MCP Server

**Files:**
- Create: `backend/app/mcp/builtin_server.py`

- [ ] **Step 1: Create built-in MCP Server**

```python
# backend/app/mcp/builtin_server.py
"""Built-in MCP Server — exposes knowledge_search and skill_get_guide tools."""
import asyncio
import json
import os
import sys

# Add project root to path for DB access
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp.server import Server, stdio_server
from mcp.types import Tool, TextContent, CallToolResult

from app.database import SessionLocal
from app.models import KnowledgeBase, App
from app.providers import get_current_embedding
from app.rag import vectorstore
from app.plugins.skill_loader import SkillInjector

server = Server("transformer-builtin")

_skill_injector = SkillInjector()


@server.list_tools()
async def list_tools() -> list[Tool]:
    return [
        Tool(
            name="knowledge_search",
            description="Search the knowledge base for relevant chunks. Call this when the user asks about specific documents or knowledge.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "kb_ids": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Optional knowledge base IDs to restrict search to",
                    },
                },
                "required": ["query"],
            },
        ),
        Tool(
            name="skill_get_guide",
            description="Get skill guide content matching the user query. Call this when a skill plugin might be relevant.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "User query to match against skill keywords"},
                    "app_id": {"type": "integer", "description": "Optional app ID to filter skills"},
                },
                "required": ["query"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    db = SessionLocal()
    try:
        if name == "knowledge_search":
            query = arguments["query"]
            kb_ids = arguments.get("kb_ids")
            try:
                embeddings = get_current_embedding(db).get_embeddings()
            except Exception:
                return [TextContent(type="text", text="Error: no embedding provider configured")]

            # Resolve KB IDs if not provided
            if not kb_ids:
                kbs = db.query(KnowledgeBase).all()
                kb_ids = [kb.id for kb in kbs]

            all_results = []
            for kb_id in kb_ids:
                try:
                    retrieved = vectorstore.search(
                        db, kb_id=kb_id, query=query,
                        embeddings_model=embeddings, top_k=3,
                        chunk_method="general_auto",
                    )
                    for chunk, score in retrieved:
                        all_results.append({
                            "kb_id": kb_id,
                            "content": chunk.content,
                            "score": score,
                            "filename": chunk.document.filename if chunk.document else "",
                        })
                    all_results.sort(key=lambda x: x["score"], reverse=True)
                    all_results = all_results[:5]
                except Exception:
                    continue

            return [TextContent(type="text", text=json.dumps(all_results, ensure_ascii=False))]

        elif name == "skill_get_guide":
            query = arguments["query"]
            app_id = arguments.get("app_id")
            enabled = _skill_injector.get_enabled_skills(db)
            if app_id:
                app = db.get(App, app_id)
                if app:
                    config = json.loads(app.config_json or "{}")
                    skill_names = config.get("skill_names", [])
                    enabled = [s for s in enabled if s.name in skill_names]
            matched = _skill_injector.match(query, enabled)
            if matched:
                return [TextContent(type="text", text=json.dumps(matched, ensure_ascii=False))]
            return [TextContent(type="text", text="[]")]

        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
    finally:
        db.close()


async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/mcp/builtin_server.py
git commit -m "feat(mcp): add built-in MCP Server with kb_search and skill_guide"
```

---

### Task 3: Extend Plugin System for mcp_server Type

**Files:**
- Modify: `backend/app/routers/plugins_v2.py`
- Modify: `backend/app/plugins/base.py` (if PluginType enum exists)

- [ ] **Step 1: Check existing plugin type handling**

Read `backend/app/plugins/base.py` and `backend/app/routers/plugins_v2.py` to understand how types are validated.

- [ ] **Step 2: Add mcp_server type to upload validation**

In `plugins_v2.py`, find the type validation and add `"mcp_server"`:

```python
# In upload_or_update_extension route, extend allowed_types:
if body.name in ("mcp_builtin",):
    raise HTTPException(status_code=400, detail="Cannot modify built-in plugin")

allowed_types = {"extension", "skill", "mcp_server"}
if body.type not in allowed_types:
    raise HTTPException(status_code=400, detail=f"Invalid type, must be one of {allowed_types}")
```

Also add `mcp_builtin` name reservation:

```python
# In upload_or_update_extension:
if body.name == "mcp_builtin":
    raise HTTPException(status_code=400, detail="Name 'mcp_builtin' is reserved")
```

- [ ] **Step 3: Handle mcp_server activate/deactivate with subprocess**

Modify the activate/deactivate routes to call MCPClientManager on `mcp_server` type:

```python
# In activate_extension route (add after the existing is_active update):
from app.mcp.client_manager import get_mcp_manager  # global singleton

# After DB update:
if ext.type == "mcp_server" and ext.is_active:
    entry_path = os.path.join(UPLOAD_DIR, ext.name, "server.py")
    if os.path.exists(entry_path):
        await get_mcp_manager().start_plugin(ext.name, entry_path)
elif ext.type == "mcp_server" and not ext.is_active:
    await get_mcp_manager().stop_plugin(ext.name)
```

- [ ] **Step 4: Add global manager to app state**

In a shared location (or in `client_manager.py`), add a module-level singleton:

```python
# At bottom of client_manager.py:
_manager: MCPClientManager | None = None

def get_mcp_manager() -> MCPClientManager:
    global _manager
    if _manager is None:
        _manager = MCPClientManager()
    return _manager
```

- [ ] **Step 5: Modify DELETE to stop plugin first**

In the delete route, add before DB delete:

```python
if ext.type == "mcp_server":
    await get_mcp_manager().stop_plugin(ext.name)
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/plugins_v2.py backend/app/mcp/client_manager.py
git commit -m "feat(plugins): support mcp_server type in plugin lifecycle"
```

---

### Task 4: App Lifespan — Auto-Start Active MCP Plugins

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Read main.py startup section**

Read `backend/app/main.py` to find the app lifespan or startup event.

- [ ] **Step 2: Add startup initialization**

Add after DB initialization:

```python
# In lifespan/startup:
from app.database import SessionLocal
from app.models import PluginExtension
from app.mcp.client_manager import get_mcp_manager
from app.mcp.builtin_server import main as builtin_main

# Start built-in MCP Server
import asyncio
# built-in runs as a separate task
builtin_task = asyncio.create_task(builtin_main())

# Start user-activated MCP Server plugins
db = SessionLocal()
try:
    plugins = db.query(PluginExtension).filter(
        PluginExtension.type == "mcp_server",
        PluginExtension.is_active == True,
    ).all()
    for plugin in plugins:
        config = json.loads(plugin.config_json or "{}")
        entry_path = os.path.join("plugins", "mcp_servers", plugin.name, "server.py")
        if os.path.exists(entry_path):
            await get_mcp_manager().start_plugin(plugin.name, entry_path)
        else:
            logger.warning("MCP plugin %s entry not found at %s", plugin.name, entry_path)
finally:
    db.close()

# On shutdown:
# await get_mcp_manager().stop_all()
# builtin_task.cancel()
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat: auto-start MCP plugins on app startup"
```

---

### Task 5: Chat Service — AgentExecutor Integration

**Files:**
- Modify: `backend/app/services/chat_service.py`

- [ ] **Step 1: Replace LlmChain with AgentExecutor when tools exist**

In `chat_with_app_config`, after building `llm` and before the `if stream:` branch, add:

```python
from app.mcp.client_manager import get_mcp_manager

mcp_tools = get_mcp_manager().get_all_tools()
use_agent = len(mcp_tools) > 0
```

Then for the streaming path:

```python
if stream:
    async def event_stream():
        try:
            if use_agent:
                from langchain.agents import create_tool_calling_agent, AgentExecutor

                agent = create_tool_calling_agent(llm, mcp_tools, prompt)
                executor = AgentExecutor(
                    agent=agent,
                    tools=mcp_tools,
                    verbose=False,
                    max_iterations=5,
                    early_stopping_method="generate",
                    handle_parsing_errors=True,
                )

                async for event in executor.astream_events(input_vars, version="v1"):
                    if event["event"] == "on_chat_model_stream":
                        chunk = event["data"]["chunk"]
                        if hasattr(chunk, "content") and chunk.content:
                            yield f"data: {json.dumps({'token': chunk.content})}\n\n"
            else:
                chain = prompt | llm | StrOutputParser()
                async for chunk in chain.astream_events(input_vars, version="v1"):
                    if chunk["event"] == "on_parser_stream":
                        token = chunk["data"]["chunk"]
                        yield f"data: {json.dumps({'token': token})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        yield "data: {\"done\": true}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

For the non-streaming path:

```python
else:
    try:
        if use_agent:
            from langchain.agents import create_tool_calling_agent, AgentExecutor

            agent = create_tool_calling_agent(llm, mcp_tools, prompt)
            executor = AgentExecutor(
                agent=agent,
                tools=mcp_tools,
                verbose=False,
                max_iterations=5,
                early_stopping_method="generate",
                handle_parsing_errors=True,
            )
            answer = await executor.ainvoke(input_vars)
            answer = answer.get("output", "")
        else:
            chain = prompt | llm | StrOutputParser()
            answer = chain.invoke(input_vars)
        answer = _hook_dispatcher.dispatch_post_chat(question, answer, {}, db)
        return {"answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调用模型失败：{str(e)}")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/chat_service.py
git commit -m "feat(chat): AgentExecutor with MCP tools when available"
```

---

### Task 6: Frontend — Upload Type Selection

**Files:**
- Modify: `frontend/src/pages/Plugins/PluginManagementPage.tsx`

- [ ] **Step 1: Read current upload dialog code**

Read `PluginManagementPage.tsx` to find the upload modal.

- [ ] **Step 2: Add type dropdown to upload form**

In the upload dialog, add a type select field:

```tsx
<div className="flex flex-col gap-1.5">
  <label className="text-xs text-text-dim">类型</label>
  <select
    value={uploadType}
    onChange={(e) => setUploadType(e.target.value)}
    className="w-full bg-bg-3 border border-border rounded-lg px-3 py-2 text-xs text-text outline-none"
  >
    <option value="skill">Skill</option>
    <option value="mcp_server">MCP Server</option>
  </select>
</div>
```

Add state:

```tsx
const [uploadType, setUploadType] = useState('skill');
```

And include in the upload request body:

```tsx
body: JSON.stringify({ name, description, type: uploadType }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Plugins/PluginManagementPage.tsx
git commit -m "feat: add MCP Server type to plugin upload"
```

---

### Task 7: Frontend — MCP Card Display

**Files:**
- Modify: `frontend/src/pages/Plugins/PluginManagementPage.tsx`

- [ ] **Step 1: Show tool count and connection status on MCP cards**

In the card rendering section, add type-specific display:

```tsx
{plugin.type === 'mcp_server' && (
  <div className="flex items-center gap-2 mt-1">
    <span className={`w-1.5 h-1.5 rounded-full ${plugin.is_active ? 'bg-green-500' : 'bg-text-mute'}`} />
    <span className="text-2xs text-text-mute">
      {plugin.is_active ? '已连接' : '未连接'}
    </span>
    {plugin.tool_count !== undefined && (
      <span className="text-2xs text-text-mute">
        · {plugin.tool_count} 个工具
      </span>
    )}
  </div>
)}
```

Add `tool_count` to the API response via `mapExtensionPlugin` in `frontend/src/lib/api.ts`:

```ts
if (ext.type === 'mcp_server') {
  const config = ext.config_json ? JSON.parse(ext.config_json) : {};
  mapped.tool_count = config.tool_count ?? 0;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Plugins/PluginManagementPage.tsx frontend/src/lib/api.ts
git commit -m "feat: show MCP plugin connection status and tool count"
```

---

### Task 8: Verify and Test

- [ ] **Step 1: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors (only pre-existing generated file warnings)

- [ ] **Step 2: Vite build**

Run: `cd frontend && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Backend import check**

Run: `cd backend && .venv/Scripts/python.exe -c "from app.mcp.client_manager import MCPClientManager; print('OK')"`
Expected: Prints OK

- [ ] **Step 4: Manual test — start backend**

Run: `cd backend && .venv/Scripts/python.exe -m uvicorn app.main:app --reload`
Expected: Server starts, logs show MCP plugins initialized

---

## Spec Coverage Check

| Spec Requirement | Task |
|---|---|
| Built-in MCP Server (knowledge_search, skill_get_guide) | Task 2 |
| User-uploadable MCP Server plugins (`mcp_server` type) | Task 3, 6 |
| Plugin lifecycle (spawn/connect/kill) | Task 1, 3 |
| MCPClientManager aggregate tools | Task 1 |
| Chat service AgentExecutor integration | Task 5 |
| Startup auto-initialization | Task 4 |
| Frontend upload type selection | Task 6 |
| Frontend MCP card display | Task 7 |
| Model compatibility fallback | Task 5 (use_agent flag, falls back to original chain) |
