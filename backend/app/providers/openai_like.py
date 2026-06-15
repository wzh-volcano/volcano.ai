"""通用 OpenAI 兼容 Provider（底座）。

兼容 OpenAI 官方、DeepSeek、Moonshot、智谱、自建代理等任何
遵循 OpenAI Chat / Embeddings 协议的端点——只需配置
base_url / api_key / model。
"""
from __future__ import annotations

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

from ..config import settings


class OpenAILikeProvider:
    """所有 OpenAI 兼容厂商的通用实现。"""

    _name = "openai_like"
    _label = "OpenAI 兼容"
    _default_base_url = "https://api.openai.com/v1"

    def __init__(
        self,
        name: str | None = None,
        label: str | None = None,
        base_url: str | None = None,
    ) -> None:
        if name:
            self._name = name
        if label:
            self._label = label
        self._base_url = base_url or self._default_base_url

    # ---- 元信息 ----
    def name(self) -> str:
        return self._name

    def label(self) -> str:
        return self._label

    def available(self) -> bool:
        """langchain-openai 是必装依赖，故恒可用。"""
        return True

    def configured(self) -> bool:
        return bool(self.base_url() and self.api_key() and self.llm_model())

    # ---- 配置读取（子类可覆盖）----
    def base_url(self) -> str:
        return settings.llm_base_url or self._base_url

    def api_key(self) -> str:
        return settings.llm_api_key

    def llm_model(self) -> str:
        return settings.llm_model

    def embedding_model(self) -> str:
        return settings.embedding_model

    # ---- 实例 ----
    def get_llm(self) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=self.llm_model(),
            base_url=self.base_url(),
            api_key=self.api_key(),
            temperature=0.3,
        )

    def get_embeddings(self) -> Embeddings:
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(
            model=self.embedding_model(),
            base_url=self.base_url(),
            api_key=self.api_key(),
        )

    # ---- 配置字段（供 /api/providers 展示与前端表单）----
    def config_fields(self) -> list[dict]:
        return [
            {
                "key": "llm_base_url",
                "label": "Base URL",
                "value": self.base_url(),
                "required": True,
            },
            {
                "key": "llm_api_key",
                "label": "API Key",
                "value": (self.api_key()[:3] + "***") if self.api_key() else "",
                "required": True,
            },
            {
                "key": "llm_model",
                "label": "LLM 模型",
                "value": self.llm_model(),
                "required": True,
            },
            {
                "key": "embedding_model",
                "label": "Embedding 模型",
                "value": self.embedding_model(),
                "required": True,
            },
        ]
