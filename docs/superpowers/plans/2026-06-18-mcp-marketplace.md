# MCP Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search & import from official MCP Registry via a search modal in PluginManagementPage.

**Architecture:** Backend `/api/mcp-marketplace/*` proxies Registry API; frontend MarketImportModal for search + one-click import. Imported servers use existing `mcp_server` plugin pipeline.

**Tech Stack:** FastAPI, SQLAlchemy, React, MCP Registry API v0.1

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/app/routers/mcp_marketplace.py` | Create | 3 endpoints: search, package detail, import |
| `backend/app/models.py` | Modify | `PluginExtension` add `runtime`/`package_id`/`env_vars_json` |
| `backend/app/mcp/client_manager.py` | Modify | `start_plugin` support `npx` runtime |
| `backend/app/main.py` | Modify | Register `mcp_marketplace` router |
| `backend/app/plugins/registry.py` | Modify | `sync_extensions_to_db` sync new fields |
| `frontend/src/types/index.ts` | Modify | Add `MarketServer`, `MarketImportResult` types |
| `frontend/src/lib/api.ts` | Modify | Add `searchMarketplace`, `getMarketPackage`, `importFromMarketplace` |
| `frontend/src/components/MarketImportModal.tsx` | Create | Search modal UI |
| `frontend/src/pages/Plugins/PluginManagementPage.tsx` | Modify | Add "市场导入" button + modal integration |

---

### Task 1: Extend PluginExtension model

**Files:**
- Modify: `backend/app/models.py:166-187`

- [ ] **Add `runtime`, `package_id`, `env_vars_json` fields**

```python
# After `error` field (line 182)
    runtime: Mapped[str] = mapped_column(String(32), default="python")
    package_id: Mapped[str] = mapped_column(String(255), default="")
    env_vars_json: Mapped[str] = mapped_column(Text, default="{}")
```

- [ ] **Update ExtensionPlugin Pydantic schemas**

Open `backend/app/schemas.py`, find `ExtensionPluginOut` and `ExtensionPluginCreate`, add:

```python
class ExtensionPluginOut(BaseModel):
    # ... existing fields ...
    runtime: str = "python"
    package_id: str = ""
    env_vars_json: str = "{}"
```

- [ ] **Commit**

```bash
git add backend/app/models.py backend/app/schemas.py
git commit -m "feat(models): add runtime/package_id/env_vars_json to PluginExtension"
```

---

### Task 2: Create mcp_marketplace router

**Files:**
- Create: `backend/app/routers/mcp_marketplace.py`

- [ ] **Create the router with search endpoint**

```python
"""MCP Marketplace — proxy to official MCP Registry API."""
import json
import logging
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_current_admin
from ..models import User

REGISTRY_BASE = "https://registry.modelcontextprotocol.io"
REGISTRY_TIMEOUT = 15

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/mcp-marketplace", tags=["mcp-marketplace"])


def _normalize_name(name: str) -> str:
    """Convert registry name (e.g. 'ai.adeu/adeu') to filesystem-safe name."""
    return re.sub(r"[^a-zA-Z0-9_]", "_", name).strip("_").lower() or "mcp_server"


def _simplify_server(item: dict) -> dict:
    s = item.get("server", {})
    pkgs = s.get("packages", [])
    pkg = pkgs[0] if pkgs else {}
    pkg_type = pkg.get("registryType", "")
    pkg_id = pkg.get("identifier", "")
    transport = pkg.get("transport", {}).get("type", "stdio")
    env_vars = [
        {
            "name": ev.get("name", ""),
            "required": ev.get("isRequired", False),
            "secret": ev.get("isSecret", False),
            "description": ev.get("description", ""),
        }
        for ev in pkg.get("environmentVariables", [])
    ]
    return {
        "name": s.get("name", ""),
        "title": s.get("title", ""),
        "description": s.get("description", ""),
        "version": s.get("version", ""),
        "packageType": pkg_type,
        "packageId": pkg_id,
        "transport": transport,
        "envVars": env_vars,
    }


@router.get("/search")
async def search_servers(
    q: str = "",
    cursor: str = "",
    limit: int = 20,
    _admin: User = Depends(get_current_admin),
) -> dict:
    """Search MCP Registry servers."""
    params = {"limit": str(min(limit, 50))}
    if cursor:
        params["cursor"] = cursor
    async with httpx.AsyncClient(timeout=REGISTRY_TIMEOUT) as client:
        resp = await client.get(f"{REGISTRY_BASE}/v0.1/servers", params=params)
        if resp.status_code != 200:
            logger.warning("Registry API error: %s %s", resp.status_code, resp.text[:200])
            raise HTTPException(status_code=502, detail="Registry API unavailable")
        data = resp.json()

    servers = data.get("servers", [])
    metadata = data.get("metadata", {})
    next_cursor = metadata.get("nextCursor", "")

    if q:
        q_lower = q.lower()
        servers = [
            item for item in servers
            if q_lower in item.get("server", {}).get("name", "").lower()
            or q_lower in item.get("server", {}).get("title", "").lower()
            or q_lower in item.get("server", {}).get("description", "").lower()
        ]

    return {
        "servers": [_simplify_server(item) for item in servers],
        "nextCursor": next_cursor,
    }
```

- [ ] **Add package detail endpoint**

```python
@router.get("/package/{name:path}/{version}")
async def get_package(
    name: str,
    version: str,
    _admin: User = Depends(get_current_admin),
) -> dict:
    """Get detailed info for a specific package version."""
    url = f"{REGISTRY_BASE}/v0.1/servers/{name}/versions/{version}"
    async with httpx.AsyncClient(timeout=REGISTRY_TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail="Package not found")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Registry API unavailable")
        return _simplify_server({"server": resp.json().get("server", {})})
```

- [ ] **Add import endpoint**

```python
@router.post("/import")
async def import_server(
    payload: dict,
    db=Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> dict:
    """Import a server from Registry and register as mcp_server plugin."""
    name = payload.get("name", "")
    version = payload.get("version", "")
    env = payload.get("env", {})

    # Fetch package info from Registry
    url = f"{REGISTRY_BASE}/v0.1/servers/{name}/versions/{version}"
    async with httpx.AsyncClient(timeout=REGISTRY_TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Package not found in Registry")

    item = resp.json()
    s = item.get("server", {})
    pkgs = s.get("packages", [])
    if not pkgs:
        raise HTTPException(status_code=400, detail="No installable package found")

    pkg = pkgs[0]
    pkg_type = pkg.get("registryType", "")
    pkg_id = pkg.get("identifier", "")
    transport = pkg.get("transport", {}).get("type", "stdio")

    if transport != "stdio":
        raise HTTPException(status_code=400, detail="Only stdio transport supported")

    # Determine runtime
    if pkg_type == "npm":
        runtime = "npx"
        # Verify npx is available
        import shutil
        if not shutil.which("npx"):
            raise HTTPException(status_code=400, detail="npx not found. Install Node.js first.")
    elif pkg_type == "pypi":
        runtime = "python"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported package type: {pkg_type}")

    # Create plugin directory
    from ..services.plugin_loader import plugins_root, NAME_RE
    safe_name = _normalize_name(name)
    if not NAME_RE.match(safe_name):
        raise HTTPException(status_code=400, detail=f"Invalid plugin name: {safe_name}")

    plugin_dir = plugins_root() / safe_name
    plugin_dir.mkdir(parents=True, exist_ok=True)

    # Write manifest.json
    manifest = {
        "name": safe_name,
        "label": s.get("title", safe_name),
        "description": s.get("description", ""),
        "version": version,
        "category": "mcp_server",
        "runtime": runtime,
        "package_id": pkg_id,
        "env_vars_json": json.dumps(env, ensure_ascii=False),
    }
    (plugin_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Create entry file
    if runtime == "npx":
        (plugin_dir / "run.sh").write_text("#!/usr/bin/env bash\n" + f"npx {pkg_id}\n", encoding="utf-8")
        (plugin_dir / "run.sh").chmod(0o755)

    # Register in registry and sync to DB
    from ..providers.registry import load_uploaded_plugins
    from ..plugins.registry import sync_extensions_to_db

    results = load_uploaded_plugins()
    sync_extensions_to_db(db)

    # Find the row and set installed=True
    from sqlalchemy import select
    from ..models import PluginExtension

    row = db.scalar(select(PluginExtension).where(PluginExtension.name == safe_name))
    if row:
        row.installed = True
        row.runtime = runtime
        row.package_id = pkg_id
        row.env_vars_json = json.dumps(env, ensure_ascii=False)
        db.commit()

    return {"name": safe_name, "installed": True, "error": None}
```

- [ ] **Commit**

```bash
git add backend/app/routers/mcp_marketplace.py
git commit -m "feat: add MCP marketplace router with search/import endpoints"
```

---

### Task 3: Register marketplace router, add deps

**Files:**
- Modify: `backend/app/main.py:140-151`

- [ ] **Add httpx dependency** (for async HTTP calls)

Run: `pip install httpx`

- [ ] **Import and register router**

```python
# After line 37 (public_api import), add:
    mcp_marketplace,
```

```python
# After line 151 (public_api.router), add:
app.include_router(mcp_marketplace.router)
```

Also add the `get_db` import to `mcp_marketplace.py` — add this import at the top:

```python
from ..database import get_db
```

- [ ] **Commit**

```bash
git add backend/app/main.py
git commit -m "feat: register mcp_marketplace router"
```

---

### Task 4: Extend MCPClientManager for npx runtime

**Files:**
- Modify: `backend/app/mcp/client_manager.py:30-33`

- [ ] **Modify start_plugin to accept runtime parameter**

```python
    async def start_plugin(self, name: str, entry: str, env: dict[str, str] | None = None,
                           runtime: str = "python") -> list[dict]:
        info = McpServerInfo(name=name, entry=entry, env={} if env is None else env)
        if runtime == "npx":
            # entry is the npm package ID (e.g., "@adeu/mcp-server")
            params = StdioServerParameters(command="npx", args=[entry],
                                            env={**env} if env is not None else None)
        else:
            params = StdioServerParameters(command=sys.executable, args=[entry],
                                            env={**env} if env is not None else None)
```

- [ ] **Update lifespan to pass runtime from PluginExtension**

Open `backend/app/main.py`, find the MCP plugin startup loop (around line 101), modify `start_plugin` call:

```python
await get_mcp_manager().start_plugin(
    plugin.name, entry,
    runtime=plugin.runtime or "python",
)
```

- [ ] **Similarly update plugins_v2.py activate endpoint**

Open `backend/app/routers/plugins_v2.py`, find the activate endpoint (line 118-122), modify `_start_mcp_plugin` call to pass runtime:

```python
await get_mcp_manager().start_plugin(
    name, entry,
    runtime=row.runtime or "python",
)
```

- [ ] **Commit**

```bash
git add backend/app/mcp/client_manager.py backend/app/main.py backend/app/routers/plugins_v2.py
git commit -m "feat: support npx runtime in MCPClientManager"
```

---

### Task 5: Update backend deps and verify

**Files:**
- Modify: `backend/app/plugins/registry.py`
- Modify: `backend/app/routers/plugins_v2.py`

- [ ] **Update sync_extensions_to_db to read new fields from manifest**

Open `backend/app/plugins/registry.py`, find `sync_extensions_to_db` (line 62). After the section that reads manifest and sets skills/hooks/frontend, add reading of runtime/package_id:

```python
        runtime = (manifest or {}).get("runtime", "python")
        package_id = (manifest or {}).get("package_id", "")
        env_vars_json = (manifest or {}).get("env_vars_json", "{}")

        if name in existing:
            row = existing[name]
            # ... existing field updates ...
            row.runtime = runtime or row.runtime
            row.package_id = package_id or row.package_id
            if env_vars_json and env_vars_json != "{}":
                row.env_vars_json = env_vars_json
            continue

        db.add(
            PluginExtension(
                # ... existing fields ...
                runtime=runtime,
                package_id=package_id,
                env_vars_json=env_vars_json,
            )
        )
```

- [ ] **Update plugins_v2.py _to_out to serialize new fields**

```python
def _to_out(p: PluginExtension) -> schemas.ExtensionPluginOut:
    return schemas.ExtensionPluginOut(
        # ... existing fields ...
        runtime=p.runtime or "python",
        package_id=p.package_id or "",
        env_vars_json=maybe_load_json(p.env_vars_json) or "{}",
    )
```

- [ ] **Commit**

```bash
git add backend/app/plugins/registry.py backend/app/routers/plugins_v2.py
git commit -m "feat: sync runtime/package_id fields in extension pipeline"
```

---

### Task 6: Add frontend types

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Add MarketServer type**

```typescript
export interface MarketServer {
  name: string;
  title: string;
  description: string;
  version: string;
  packageType: string;
  packageId: string;
  transport: string;
  envVars: MarketEnvVar[];
}

export interface MarketEnvVar {
  name: string;
  required: boolean;
  secret: boolean;
  description: string;
}

export interface MarketImportResult {
  name: string;
  installed: boolean;
  error: string | null;
}

export interface MarketSearchResult {
  servers: MarketServer[];
  nextCursor: string;
}
```

- [ ] **Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add marketplace types"
```

---

### Task 7: Add marketplace API calls

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Add searchMarketplace, getMarketPackage, importFromMarketplace**

```typescript
import type { MarketSearchResult, MarketServer, MarketImportResult } from '@/types';

// After existing methods, add:

  searchMarketplace: async (q: string, cursor?: string): Promise<MarketSearchResult> => {
    const params = new URLSearchParams({ q, limit: '20' });
    if (cursor) params.set('cursor', cursor);
    return request<MarketSearchResult>(`/api/mcp-marketplace/search?${params}`);
  },

  getMarketPackage: async (name: string, version: string): Promise<MarketServer> => {
    return request<MarketServer>(`/api/mcp-marketplace/package/${encodeURIComponent(name)}/${encodeURIComponent(version)}`);
  },

  importFromMarketplace: async (name: string, version: string, env?: Record<string, string>): Promise<MarketImportResult> => {
    return request<MarketImportResult>('/api/mcp-marketplace/import', {
      method: 'POST',
      body: JSON.stringify({ name, version, env: env || {} }),
    });
  },
```

- [ ] **Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add marketplace API calls"
```

---

### Task 8: Create MarketImportModal component

**Files:**
- Create: `frontend/src/components/MarketImportModal.tsx`

- [ ] **Write the modal component**

```tsx
import { useState, useCallback, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Search, Download, ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import type { MarketServer } from '@/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export default function MarketImportModal({ open, onOpenChange, onImported }: Props) {
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState<MarketServer[]>([]);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketServer | null>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (newSearch?: boolean) => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    if (newSearch) { setServers([]); setCursor(''); setSelected(null); }
    try {
      const result = await api.searchMarketplace(query, newSearch ? undefined : cursor);
      setServers(prev => newSearch ? result.servers : [...prev, ...result.servers]);
      setCursor(result.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, cursor]);

  const handleScroll = useCallback(() => {
    if (!listRef.current || loading || !cursor) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      search();
    }
  }, [loading, cursor, search]);

  const handleImport = async (server: MarketServer) => {
    setImporting(server.name);
    setError(null);
    try {
      const result = await api.importFromMarketplace(server.name, server.version, envValues);
      if (result.error) {
        setError(result.error);
        return;
      }
      onImported();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(null);
    }
  };

  useEffect(() => {
    if (!open) {
      setQuery('');
      setServers([]);
      setCursor('');
      setSelected(null);
      setError(null);
      setEnvValues({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>从 MCP 市场导入</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="搜索 MCP Server..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(true)}
          />
          <Button onClick={() => search(true)} disabled={loading || !query.trim()}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            搜索
          </Button>
        </div>

        {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

        <div className="flex gap-4 flex-1 min-h-0">
          <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto space-y-2 pr-2">
            {servers.length === 0 && !loading && query && (
              <p className="text-text-mute text-sm text-center py-8">No results</p>
            )}
            {servers.map(s => (
              <div
                key={s.name + s.version}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selected?.name === s.name ? 'border-accent bg-accent/5' : 'border-border hover:border-accent/50'
                }`}
                onClick={() => { setSelected(s); setEnvValues({}); }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{s.title || s.name}</p>
                    <p className="text-xs text-text-mute mt-0.5">{s.description?.slice(0, 80)}{s.description?.length > 80 ? '...' : ''}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.packageType === 'npm' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {s.packageType}
                  </span>
                </div>
                <div className="flex gap-2 mt-1.5 text-xs text-text-mute">
                  <span>v{s.version}</span>
                  <span>{s.transport}</span>
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin" /></div>}
          </div>

          {selected && (
            <div className="w-72 shrink-0 border-l border-border pl-4 overflow-y-auto">
              <h3 className="font-medium text-sm">{selected.title || selected.name}</h3>
              <p className="text-xs text-text-mute mt-1">{selected.description}</p>

              <div className="mt-3 text-xs space-y-1 text-text-mute">
                <p>Version: <span className="text-text">{selected.version}</span></p>
                <p>Package: <span className="text-text">{selected.packageType}</span></p>
                <p>Transport: <span className="text-text">{selected.transport}</span></p>
              </div>

              {selected.envVars.filter(v => v.required).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium mb-2">Environment Variables</p>
                  {selected.envVars.filter(v => v.required).map(ev => (
                    <div key={ev.name} className="mb-2">
                      <label className="text-xs text-text-mute block mb-0.5">
                        {ev.name} {ev.description && <span className="italic">— {ev.description}</span>}
                      </label>
                      <Input
                        size={1}
                        type={ev.secret ? 'password' : 'text'}
                        placeholder={ev.name}
                        value={envValues[ev.name] || ''}
                        onChange={e => setEnvValues(prev => ({ ...prev, [ev.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}

              <Button
                size="sm"
                className="w-full mt-4"
                onClick={() => handleImport(selected)}
                disabled={importing === selected.name}
              >
                {importing === selected.name ? (
                  <><Loader2 size={14} className="animate-spin mr-1" /> 导入中...</>
                ) : (
                  <><Download size={14} className="mr-1" /> 导入并安装</>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Commit**

```bash
git add frontend/src/components/MarketImportModal.tsx
git commit -m "feat: add MarketImportModal component"
```

---

### Task 9: Integrate modal into PluginManagementPage

**Files:**
- Modify: `frontend/src/pages/Plugins/PluginManagementPage.tsx`

- [ ] **Add import for MarketImportModal**

```tsx
import MarketImportModal from '@/components/MarketImportModal';
```

- [ ] **Add state for market modal**

```tsx
const [marketOpen, setMarketOpen] = useState(false);
```

- [ ] **Add button next to existing upload button** (after line 464)

```tsx
<Button size="sm" variant="outline" onClick={() => setMarketOpen(true)} className="gap-1.5">
  <Search size={14} />
  市场导入
</Button>
```

- [ ] **Add modal near end of render** (after the upload Dialog)

```tsx
<MarketImportModal
  open={marketOpen}
  onOpenChange={setMarketOpen}
  onImported={loadPlugins}
/>
```

- [ ] **Commit**

```bash
git add frontend/src/pages/Plugins/PluginManagementPage.tsx
git commit -m "feat: integrate MarketImportModal into PluginManagementPage"
```

---

### Task 10: End-to-end test

- [ ] **Restart backend**

```bash
# Kill existing uvicorn, start fresh
uvicorn app.main:app --reload --port 8000
```

- [ ] **Test search API**

```bash
curl -H "Authorization: Bearer $(curl -s -X POST http://localhost:8000/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' | python -c 'import sys,json; print(json.load(sys.stdin)["access_token"])')" "http://localhost:8000/api/mcp-marketplace/search?q=git"
```

Expected: 200 with servers list containing git-related MCP servers.

- [ ] **Test import API**

```bash
curl -X POST http://localhost:8000/api/mcp-marketplace/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name": "io.github.test/test", "version": "1.0.0"}'
```

Expected: 200 with `{"installed": true}` or 400 with valid error.

- [ ] **Test frontend modal opens and searches**

Open PluginManagementPage in browser, click "市场导入", type a search query, verify results appear.

- [ ] **Commit**

```bash
git add -A
git commit -m "feat: complete MCP marketplace integration"
```
