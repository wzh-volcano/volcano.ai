"""Provider 注册表与工厂。

启动时收集所有已注册 provider，仅当依赖已安装（available()=True）才视为可用。
get_provider(name) 按名称返回实例；get_current() 返回 .env 中 LLM_PROVIDER 指定的那个。
"""
from __future__ import annotations

from typing import Protocol

from ..config import settings
from .ollama import OllamaProvider
from .openai_like import OpenAILikeProvider
from .zhipu import ZhipuProvider


class _ProviderProto(Protocol):  # 与 base.Provider 等价的轻量协议
    def name(self) -> str: ...
    def label(self) -> str: ...
    def available(self) -> bool: ...
    def configured(self) -> bool: ...
    def get_llm(self): ...
    def get_embeddings(self): ...
    def config_fields(self) -> list[dict]: ...


# 所有已注册的 provider 类（按需实例化）
_REGISTRY: dict[str, type] = {
    "zhipu": ZhipuProvider,
    "openai_like": OpenAILikeProvider,
    "ollama": OllamaProvider,
}


def list_providers() -> list[_ProviderProto]:
    """返回所有已注册 provider 的实例列表（无论是否可用）。"""
    return [cls() for cls in _REGISTRY.values()]


def available_providers() -> list[_ProviderProto]:
    """仅返回依赖已安装的 provider。"""
    return [p for p in list_providers() if p.available()]


def get_provider(name: str | None = None) -> _ProviderProto:
    """按名称返回 provider 实例；name 为空时取 .env 中的当前 provider。"""
    name = name or settings.llm_provider
    cls = _REGISTRY.get(name)
    if cls is None:
        # 回退到默认底座，避免启动崩溃
        return OpenAILikeProvider()
    return cls()


def get_current() -> _ProviderProto:
    """当前生效的 provider（.env LLM_PROVIDER）。"""
    return get_provider(settings.llm_provider)
