"""MCP Marketplace — proxy to official MCP Registry API."""
import json
import logging
import re
import shutil

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select

from ..database import get_db
from ..deps import get_current_admin
from ..models import PluginExtension, User

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
        # Can't handle streamable-http or other transports yet
        raise HTTPException(status_code=400, detail="Only stdio transport supported")

    # Determine runtime
    if pkg_type == "npm":
        runtime = "npx"
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

    # For npx runtime, ensure the entry field references the package_id
    if runtime == "npx":
        (plugin_dir / "run.sh").write_text(
            "#!/usr/bin/env bash\n" + f"npx {pkg_id}\n",
            encoding="utf-8",
        )
        (plugin_dir / "run.sh").chmod(0o755)

    # Register in registry and sync to DB
    from ..providers.registry import load_uploaded_plugins
    from ..plugins.registry import sync_extensions_to_db

    results = load_uploaded_plugins()
    sync_extensions_to_db(db)

    # Find the row and set installed=True + extra fields
    row = db.scalar(select(PluginExtension).where(PluginExtension.name == safe_name))
    if row:
        row.installed = True
        row.runtime = runtime
        row.package_id = pkg_id
        row.env_vars_json = json.dumps(env, ensure_ascii=False)
        db.commit()

    return {"name": safe_name, "installed": True, "error": None}
