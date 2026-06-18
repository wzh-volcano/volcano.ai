"""Extension 插件管理路由（管理员专属）。

注意：本模块刻意不使用 ``from __future__ import annotations``，
因为 FastAPI 会读取真实的返回注解判断是否需要序列化响应体；
若注解被字符串化，DELETE 204 端点会被误判为有 response_model。
"""
import asyncio
import json
import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..database import get_db, SessionLocal
from ..deps import get_current_admin
from ..mcp.client_manager import get_mcp_manager
from ..models import PluginExtension, User

async def _start_mcp_plugin(name: str, entry: str):
    """Start MCP plugin subprocess and handle errors."""
    try:
        await get_mcp_manager().start_plugin(name, entry)
        logging.getLogger(__name__).info("MCP plugin %s started successfully", name)
    except Exception as exc:
        logging.getLogger(__name__).error("Failed to start MCP plugin %s: %s", name, exc)
        db = SessionLocal()
        try:
            row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
            if row:
                row.error = str(exc)
                row.is_active = False
                db.commit()
        finally:
            db.close()


router = APIRouter(prefix="/api/plugins/v2", tags=["plugins-v2"])


@router.get("/mcp/status")
async def mcp_status(
    _admin: User = Depends(get_current_admin),
) -> dict:
    from ..mcp.client_manager import get_mcp_manager
    return get_mcp_manager().get_status_dict()


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
async def activate_extension(
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

    # For mcp_server plugins, start the subprocess
    if row.category == "mcp_server":
        from ..services.plugin_loader import plugins_root
        entry = str(plugins_root() / name / "server.py")
        if os.path.exists(entry):
            asyncio.create_task(_start_mcp_plugin(name, entry))

    return _to_out(row)


@router.post("/{name}/deactivate", response_model=schemas.ExtensionPluginOut)
async def deactivate_extension(
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

    if row.category == "mcp_server":
        asyncio.create_task(get_mcp_manager().stop_plugin(name))

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

    # skills_json 中每个技能可能是纯字符串路径或 dict 配置
    if isinstance(skill_entry, str):
        skill_entry = {"path": skill_entry, "keywords": [], "match_mode": "keyword"}
    skill_entry["keywords"] = payload.keywords
    skill_entry["match_mode"] = payload.match_mode
    skills[payload.name] = skill_entry
    row.skills_json = json.dumps(skills, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/{name}", status_code=204)
async def delete_extension(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> None:
    if name == "mcp_builtin":
        raise HTTPException(status_code=400, detail="Cannot delete built-in MCP server")

    row = db.scalar(select(PluginExtension).where(PluginExtension.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")

    # Stop MCP plugin if active
    if row.category == "mcp_server":
        await get_mcp_manager().stop_plugin(name)

    from ..services.plugin_loader import PluginError, uninstall
    try:
        uninstall(name)
    except PluginError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.delete(row)

    # 同时清理可能残留的 provider_configs 行
    from ..models import ProviderConfig
    pc = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if pc is not None:
        db.delete(pc)

    db.commit()
