"""Provider 抽象基类。

每个插件实现该接口，对外暴露 LLM 与 Embeddings。
底座统一走 OpenAI 兼容协议（ChatOpenAI / OpenAIEmbeddings），
所以智谱、DeepSeek、Moonshot、自建代理只需配置 base_url/api_key/model。
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel


@runtime_checkable
class Provider(Protocol):
    """所有 provider 插件需实现的接口。"""

    def name(self) -> str:
        """provider 唯一标识，如 'zhipu'。"""
        ...

    def label(self) -> str:
        """展示名，如 '智谱 GLM'。"""
        ...

    def available(self) -> bool:
        """依赖是否已安装（可选依赖如 ollama 可能未装）。"""
        ...

    def configured(self) -> bool:
        """必填配置（如 api_key）是否齐全。"""
        ...

    def get_llm(self) -> BaseChatModel:
        ...

    def get_embeddings(self) -> Embeddings:
        ...

    def config_fields(self) -> list[dict]:
        """返回该 provider 的可配置字段定义，供 /api/providers 展示。"""
        ...
