"""Providers 插件包入口。

外部直接 from app.providers import get_provider, get_current, available_providers
"""
from .base import Provider
from .registry import (
    available_providers,
    get_current,
    get_current_embedding,
    get_current_legacy,
    get_provider,
    list_provider_names,
    list_providers,
    load_uploaded_plugins,
    sync_builtin_to_db,
    sync_uploaded_to_db,
)

__all__ = [
    "Provider",
    "available_providers",
    "get_current",
    "get_current_embedding",
    "get_current_legacy",
    "get_provider",
    "list_provider_names",
    "list_providers",
    "load_uploaded_plugins",
    "sync_builtin_to_db",
    "sync_uploaded_to_db",
]
