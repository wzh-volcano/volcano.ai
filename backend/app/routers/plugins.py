"""插件管理路由（管理员专属）。

端点：
- GET    /api/plugins           列出所有插件 + 配置
- POST   /api/plugins/upload    上传 zip 安装上传型插件
- PATCH  /api/plugins/{name}    修改配置（base_url / api_key / model 等）
- POST   /api/plugins/{name}/install    标记 installed=True
- POST   /api/plugins/{name}/activate   设为唯一 is_active=True
- DELETE /api/plugins/{name}    卸载（仅 uploaded 可彻底删除文件）

注意：本模块刻意不使用 ``from __future__ import annotations``，
因为 FastAPI 会读取真实的返回注解判断是否需要序列化响应体；
若注解被字符串化，DELETE 204 端点会被误判为有 response_model。
"""
import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_admin
from ..models import ProviderConfig, User
from ..providers import (
    load_uploaded_plugins,
    sync_uploaded_to_db,
)
from ..providers.registry import _instantiate
from ..services import plugin_loader

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


def _to_out(p: ProviderConfig) -> schemas.PluginOut:
    return schemas.PluginOut(
        id=p.id,
        name=p.name,
        label=p.label,
        category=p.category or "model",
        source=p.source,
        module_path=p.module_path,
        installed=p.installed,
        is_active=p.is_active,
        is_embedding_active=bool(getattr(p, "is_embedding_active", False)),
        base_url=p.base_url or "",
        api_key_set=bool(p.api_key),
        embedding_model=p.embedding_model or "",
        extra_json=p.extra_json or None,
        error=p.error,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


@router.get("", response_model=list[schemas.PluginOut])
def list_plugins(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[schemas.PluginOut]:
    rows = db.scalars(select(ProviderConfig).order_by(ProviderConfig.id)).all()
    return [_to_out(p) for p in rows]


@router.post("/upload", response_model=schemas.PluginInstallResponse)
async def upload_plugin(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginInstallResponse:
    """上传 zip 包；解压、读 manifest、尝试 import。"""
    content = await file.read()
    try:
        name, error = plugin_loader.install_from_upload(
            content, file.filename or "plugin.zip"
        )
    except plugin_loader.PluginError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 重新扫描所有上传插件并同步到 DB（顺便把 _REGISTRY 更新）
    results = load_uploaded_plugins()
    sync_uploaded_to_db(db, results)

    return schemas.PluginInstallResponse(
        name=name, installed=(error is None), error=error
    )


@router.post("/import", response_model=schemas.PluginInstallResponse)
def import_plugin(
    payload: schemas.PluginImportRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginInstallResponse:
    """通过 URL 导入插件 zip。后端拉取后走与 /upload 相同的安装流水线。"""
    try:
        name, error = plugin_loader.install_from_url(payload.url)
    except plugin_loader.PluginError as e:
        raise HTTPException(status_code=400, detail=str(e))

    results = load_uploaded_plugins()
    sync_uploaded_to_db(db, results)

    return schemas.PluginInstallResponse(
        name=name, installed=(error is None), error=error
    )


@router.patch("/{name}", response_model=schemas.PluginOut)
def update_plugin(
    name: str,
    payload: schemas.PluginUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginOut:
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")

    if payload.label is not None:
        row.label = payload.label
    if payload.category is not None:
        row.category = payload.category
    if payload.base_url is not None:
        row.base_url = payload.base_url
    if payload.api_key:  # 留空字符串视为不修改
        row.api_key = payload.api_key
    if payload.embedding_model is not None:
        row.embedding_model = payload.embedding_model
    if payload.is_active is not None:
        if payload.is_active:
            row.is_active = True
        else:
            row.is_active = False
    if payload.is_embedding_active is not None:
        if payload.is_embedding_active:
            db.execute(update(ProviderConfig).values(is_embedding_active=False))
            row.is_embedding_active = True
        else:
            row.is_embedding_active = False
    if payload.extra_json is not None:
        try:
            json.loads(payload.extra_json)  # 校验合法 JSON
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="extra_json 不是合法 JSON")
        row.extra_json = payload.extra_json

    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/{name}/models", response_model=schemas.PluginModelsResponse)
def list_plugin_models(
    name: str,
    payload: schemas.PluginModelsRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginModelsResponse:
    """拉取该插件当前可用的模型 ID 列表。

    - 表单值优先：``payload.base_url`` / ``payload.api_key`` 留空时回退到
      已保存的 ProviderConfig 行（允许在保存前用刚填的值试拉）。
    - Provider 不支持拉取（未实现 ``list_models``）→ 400 友好提示。
    - 端点调用失败（401 / 超时 / 网络）→ 400 带原始原因。
    """
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件加载失败：{row.error}")

    base_url = (payload.base_url or row.base_url or "").strip()
    # 表单未填 api_key 时回退 DB 已存值
    api_key = payload.api_key or row.api_key or ""

    if not base_url:
        raise HTTPException(status_code=400, detail="请先填写 Base URL")

    config = {
        "base_url": base_url,
        "api_key": api_key,
        "embedding_model": row.embedding_model,
    }
    try:
        config["extra"] = json.loads(row.extra_json or "{}")
    except json.JSONDecodeError:
        config["extra"] = {}

    provider = _instantiate(row.name, config=config)
    if not hasattr(provider, "list_models"):
        raise HTTPException(
            status_code=400, detail="该插件不支持拉取模型列表，请手动填写"
        )
    try:
        models = provider.list_models()
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001 - 转成友好提示，避免 500
        raise HTTPException(status_code=400, detail=f"拉取失败：{type(e).__name__}: {e}")
    return schemas.PluginModelsResponse(models=models)


@router.post("/{name}/install", response_model=schemas.PluginOut)
def install_plugin(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginOut:
    """把插件标记为已安装；前端按钮触发，需要先有 base_url/api_key 等关键配置。"""
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件加载失败：{row.error}")
    row.installed = True
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/{name}/activate", response_model=schemas.PluginOut)
def activate_plugin(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginOut:
    """标记插件为 LLM 可用（允许多个同时激活）。"""
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if not row.installed:
        raise HTTPException(status_code=400, detail="请先安装插件后再激活")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件存在错误：{row.error}")

    row.is_active = True
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.post("/{name}/activate-embedding", response_model=schemas.PluginOut)
def activate_embedding_plugin(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> schemas.PluginOut:
    """把该插件设为当前生效的 Embedding provider（与 LLM 激活独立）。"""
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")
    if not row.installed:
        raise HTTPException(status_code=400, detail="请先安装插件后再激活")
    if row.error:
        raise HTTPException(status_code=400, detail=f"插件存在错误：{row.error}")
    if not (row.embedding_model or "").strip():
        raise HTTPException(
            status_code=400,
            detail="请先在配置中填写 Embedding 模型名称",
        )

    # 互斥：先全部置 False，再激活当前
    db.execute(update(ProviderConfig).values(is_embedding_active=False))
    row.is_embedding_active = True
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.get("/active-models", response_model=list[schemas.ActiveModelOut])
def list_active_models_endpoint(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> list[schemas.ActiveModelOut]:
    """返回所有已安装已激活 provider 的模型列表。供 Studio 配置页用。"""
    from ..providers.registry import list_active_models

    return [schemas.ActiveModelOut(**m) for m in list_active_models(db)]


@router.delete("/{name}", status_code=204)
def delete_plugin(
    name: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
) -> None:
    """卸载插件：

    - builtin 插件只能 reset（清空配置 + installed=False + is_active=False）
    - uploaded 插件会删除 data/plugins/<name>/ 目录并删除 DB 行
    """
    row = db.scalar(select(ProviderConfig).where(ProviderConfig.name == name))
    if row is None:
        raise HTTPException(status_code=404, detail="插件不存在")

    if row.source == "uploaded":
        try:
            plugin_loader.uninstall(name)
        except plugin_loader.PluginError as e:
            raise HTTPException(status_code=400, detail=str(e))
        db.delete(row)
    else:
        row.installed = False
        row.is_active = False
        row.is_embedding_active = False
        row.api_key = ""
        row.error = None
    db.commit()
