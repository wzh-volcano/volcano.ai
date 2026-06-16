"""Ollama Provider（可选插件）。

仅当安装了 langchain-ollama 时才可用；未安装则 available() 返回 False，
registry 不会把它作为可用项暴露——这就是「根据安装的插件配置厂商」。
"""
from __future__ import annotations

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

# 探测可选依赖
try:
    from langchain_ollama import ChatOllama, OllamaEmbeddings

    _OLLAMA_AVAILABLE = True
except ImportError:  # pragma: no cover - 环境依赖
    _OLLAMA_AVAILABLE = False


class OllamaProvider:
    """本地 Ollama，无需 API Key。"""

    _default_base_url = "http://localhost:11434"
    _default_llm_model = "qwen2.5"
    _default_embedding_model = "nomic-embed-text"

    def __init__(self, config: dict | None = None) -> None:
        self._config: dict = config or {}

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
        return self._config.get("base_url") or self._default_base_url

    def api_key(self) -> str:
        return ""  # ollama 不需要

    def llm_model(self) -> str:
        return self._config.get("llm_model") or self._default_llm_model

    def embedding_model(self) -> str:
        return self._config.get("embedding_model") or self._default_embedding_model

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

    # ---- 模型列表（可选能力，供前端「拉取模型列表」按钮）----
    def list_models(self) -> list[str]:
        """从 Ollama ``GET {base_url}/api/tags`` 拉取本地已安装的模型名。

        Ollama 不区分 chat / embedding，统一返回所有已 pull 的模型。
        失败时抛 ``RuntimeError``，由上层路由转成 400。
        """
        import httpx

        base_url = self.base_url().rstrip("/")
        try:
            resp = httpx.get(f"{base_url}/api/tags", timeout=10.0)
        except httpx.TimeoutException as e:
            raise RuntimeError(f"连接 {base_url} 超时") from e
        except httpx.HTTPError as e:
            raise RuntimeError(f"请求失败：{e}") from e

        if resp.status_code >= 400:
            raise RuntimeError(f"Ollama 返回 HTTP {resp.status_code}")

        try:
            payload = resp.json()
        except ValueError as e:
            raise RuntimeError("响应不是合法 JSON") from e

        items = payload.get("models") if isinstance(payload, dict) else None
        models: list[str] = []
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict) and it.get("name"):
                    models.append(str(it["name"]))
        return sorted(dict.fromkeys(models))  # 去重 + 排序

    def config_fields(self) -> list[dict]:
        return [
            {
                "key": "base_url",
                "label": "Ollama 地址",
                "value": self.base_url(),
                "required": True,
                "type": "text",
            },
            {
                "key": "llm_model",
                "label": "LLM 模型",
                "value": self.llm_model(),
                "required": True,
                "type": "text",
            },
            {
                "key": "embedding_model",
                "label": "Embedding 模型",
                "value": self.embedding_model(),
                "required": True,
                "type": "text",
            },
        ]
