"""Provider 信息接口（保持向后兼容）。

注意：插件管理逻辑已迁移到 /api/plugins，本路由保留用于查询当前生效 provider。
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..providers import (
    available_providers,
    get_current,
    list_providers,
)

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[schemas.ProviderInfo])
def get_providers(db: Session = Depends(get_db)) -> list[schemas.ProviderInfo]:
    """返回所有 provider 元信息（不含 DB 配置注入）。"""
    current = get_current(db)
    current_name = current.name()
    available = {p.name() for p in available_providers()}

    result: list[schemas.ProviderInfo] = []
    for p in list_providers():
        is_available = p.name() in available
        is_configured = p.configured() if is_available else False
        result.append(
            schemas.ProviderInfo(
                name=p.name(),
                label=p.label(),
                available=is_available,
                configured=is_configured,
                is_current=(p.name() == current_name),
                config_fields=[
                    schemas.ProviderConfigField(**f) for f in p.config_fields()
                ],
            )
        )
    return result


@router.get("/current")
def get_current_provider(db: Session = Depends(get_db)) -> dict:
    """当前生效的 provider 摘要。"""
    p = get_current(db)
    return {
        "name": p.name(),
        "label": p.label(),
        "configured": p.configured(),
        "embedding_model": p.embedding_model() if hasattr(p, "embedding_model") else "",
    }
