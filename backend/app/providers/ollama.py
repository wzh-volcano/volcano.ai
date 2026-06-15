"""Ollama Provider（可选插件）。

仅当安装了 langchain-ollama 时才可用；未安装则 available() 返回 False，
registry 不会把它作为可用项暴露——这就是「根据安装的插件配置厂商」。
"""
from __future__ import annotations

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

from ..config import settings

# 探测可选依赖
try:
    from langchain_ollama import ChatOllama, OllamaEmbeddings

    _OLLAMA_AVAILABLE = True
except ImportError:  # pragma: no cover - 环境依赖
    _OLLAMA_AVAILABLE = False


class OllamaProvider:
    """本地 Ollama，无需 API Key。"""

    _base_url = "http://localhost:11434"
    _llm_model = "qwen2.5"
    _embedding_model = "nomic-embed-text"

    def name(self) -> str:
        return "ollama"

    def label(self) -> str:
        return "Ollama (本地)"

    def available(self) -> bool:
        return _OLLAMA_AVAILABLE

    def configured(self) -> bool:
        # 本地服务，不需要 key；只要依赖装了即视为可配置
        return _OLLAMA_AVAILABLE

    def base_url(self) -> str:
        return settings.llm_base_url or self._base_url

    def llm_model(self) -> str:
        return settings.llm_model or self._llm_model

    def embedding_model(self) -> str:
        return settings.embedding_model or self._embedding_model

    def get_llm(self) -> BaseChatModel:
        if not _OLLAMA_AVAILABLE:
            raise RuntimeError("langchain-ollama 未安装，无法使用 Ollama provider")
        return ChatOllama(
            model=self.llm_model(),
            base_url=self.base_url(),
            temperature=0.3,
        )

    def get_embeddings(self) -> Embeddings:
        if not _OLLAMA_AVAILABLE:
            raise RuntimeError("langchain-ollama 未安装，无法使用 Ollama provider")
        return OllamaEmbeddings(
            model=self.embedding_model(),
            base_url=self.base_url(),
        )

    def config_fields(self) -> list[dict]:
        return [
            {
                "key": "llm_base_url",
                "label": "Ollama 地址",
                "value": self.base_url(),
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
