"""Provider 信息接口：供前端表单与状态展示。"""
from fastapi import APIRouter

from .. import schemas
from ..config import settings
from ..providers import available_providers, get_current, list_providers

router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[schemas.ProviderInfo])
def get_providers() -> list[schemas.ProviderInfo]:
    """返回所有 provider，含可用性、配置完整性与当前选中状态。"""
    current = get_current()
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
def get_current_provider() -> dict:
    """当前生效的 provider 摘要。"""
    p = get_current()
    return {
        "name": p.name(),
        "label": p.label(),
        "configured": p.configured(),
        "llm_model": settings.llm_model,
        "embedding_model": settings.embedding_model,
    }
