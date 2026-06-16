"""通用 OpenAI 兼容 Provider（底座）。

兼容 OpenAI 官方、DeepSeek、Moonshot、智谱、自建代理等任何
遵循 OpenAI Chat / Embeddings 协议的端点——只需配置
base_url / api_key / model。

构造时可注入运行时配置（ProviderConfig 行），缺省时回退到 .env。
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
        config: dict | None = None,
    ) -> None:
        if name:
            self._name = name
        if label:
            self._label = label
        self._base_url = base_url or self._default_base_url
        # 来自 ProviderConfig 行的运行时配置
        self._config: dict = config or {}

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

    # ---- 配置读取（优先 DB，回退到 settings/默认值）----
    def base_url(self) -> str:
        return (
            self._config.get("base_url")
            or settings.llm_base_url
            or self._base_url
        )

    def api_key(self) -> str:
        return self._config.get("api_key") or settings.llm_api_key

    def llm_model(self) -> str:
        return self._config.get("llm_model") or settings.llm_model

    def embedding_model(self) -> str:
        return self._config.get("embedding_model") or settings.embedding_model

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

    # ---- 模型列表（可选能力，供前端「拉取模型列表」按钮）----
    def list_models(self) -> list[str]:
        """从 OpenAI 兼容的 ``GET {base_url}/models`` 端点拉取可用模型 ID。

        失败时抛 ``RuntimeError``，由上层路由转成 400，便于前端展示
        具体原因（如 401 Key 无效、连接超时等）。
        """
        import httpx

        base_url = self.base_url().rstrip("/")
        api_key = self.api_key()
        try:
            resp = httpx.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"} if api_key else {},
                timeout=10.0,
            )
        except httpx.TimeoutException as e:
            raise RuntimeError(f"连接 {base_url} 超时") from e
        except httpx.HTTPError as e:
            raise RuntimeError(f"请求失败：{e}") from e

        if resp.status_code == 401:
            raise RuntimeError("API Key 无效或未授权（401）")
        if resp.status_code >= 400:
            raise RuntimeError(f"厂商返回 HTTP {resp.status_code}")

        try:
            payload = resp.json()
        except ValueError as e:
            raise RuntimeError("响应不是合法 JSON") from e

        items = payload.get("data") if isinstance(payload, dict) else None
        models: list[str] = []
        if isinstance(items, list):
            for it in items:
                if isinstance(it, dict) and it.get("id"):
                    models.append(str(it["id"]))
        return sorted(dict.fromkeys(models))  # 去重 + 排序

    # ---- 配置字段（供 /api/plugins 展示与前端表单）----
    def config_fields(self) -> list[dict]:
        return [
            {
                "key": "base_url",
                "label": "Base URL",
                "value": self.base_url(),
                "required": True,
                "type": "text",
            },
            {
                "key": "api_key",
                "label": "API Key",
                "value": (self.api_key()[:3] + "***") if self.api_key() else "",
                "required": True,
                "type": "password",
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
