"""Plugin 插件抽象基类。

Plugin Protocol 是插件系统 v2 的统一接口，
插件可以暴露技能、路由、钩子，也可向下兼容现有 Provider。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Protocol, runtime_checkable

from fastapi import APIRouter
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel


@runtime_checkable
class Plugin(Protocol):
    """所有插件需实现的接口。"""

    def name(self) -> str:
        """插件唯一标识，如 'web_search'。"""
        ...

    def label(self) -> str:
        """展示名，如 '网络搜索'。"""
        ...

    def category(self) -> str:
        """插件分类，如 'search', 'tool', 'provider'。"""
        ...

    def available(self) -> bool:
        """依赖是否已安装。"""
        ...

    # Optional hooks

    def get_skills(self) -> list[SkillDef]:
        """返回该插件提供的技能列表。"""
        ...

    def register_routes(self) -> APIRouter | None:
        """可选：注册额外的 API 路由。"""
        ...

    def get_hooks(self) -> PluginHooks | None:
        """可选：返回聊天前/后钩子。"""
        ...

    def get_provider(self) -> Provider | None:
        """可选：向下兼容现有 Provider 接口。"""
        ...


@runtime_checkable
class Provider(Protocol):
    """现有 provider 接口，向后兼容。"""

    def name(self) -> str:
        ...

    def label(self) -> str:
        ...

    def available(self) -> bool:
        ...

    def configured(self) -> bool:
        ...

    def get_llm(self) -> BaseChatModel:
        ...

    def get_embeddings(self) -> Embeddings:
        ...

    def list_models(self) -> list[str]:
        ...

    def config_fields(self) -> list[dict]:
        ...


@dataclass
class SkillDef:
    """技能定义，描述插件中的一个可匹配技能。"""

    name: str
    plugin_name: str
    content: str
    match_mode: str = "keyword"       # "always" | "keyword"
    keywords: list[str] = field(default_factory=list)


@dataclass
class PluginHooks:
    """聊天前/后钩子。"""

    pre_chat: Callable | None = None
    post_chat: Callable | None = None
