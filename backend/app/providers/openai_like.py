"""通用 OpenAI 兼容 Provider（底座）。

兼容 OpenAI 官方、DeepSeek、Moonshot、智谱、自建代理等任何
遵循 OpenAI Chat / Embeddings 协议的端点——只需配置
base_url / api_key / model。

构造时可注入运行时配置（ProviderConfig 行），缺省时回退到 .env。
"""
from __future__ import annotations

import logging
from typing import List

import httpx
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel

from ..config import settings

logger = logging.getLogger(__name__)


class _SimpleOpenAIEmbeddings(Embeddings):
    """极简 OpenAI/DashScope 兼容 embeddings 客户端。

    绕开 langchain-openai 的 tiktoken 预切分逻辑，
    直接 POST {"model": ..., "input": [str, ...]}。
    通义百炼 / 智谱 / DeepSeek / OpenAI 官方均接受这种 payload。
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        batch_size: int = 10,
        timeout: float = 60.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.batch_size = batch_size
        self.timeout = timeout

    def _post(self, inputs: List[str]) -> List[List[float]]:
        url = f"{self.base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": self.model, "input": inputs}

        # 关键日志：实际发送的 url / model / 第一条文本前 80 字符
        first_preview = (inputs[0][:80] + "…") if inputs else ""
        logger.info(
            "[embed] POST %s model=%s n=%d first=%r",
            url,
            self.model,
            len(inputs),
            first_preview,
        )
        # 类型断言，绝对保证 input 是 list[str]
        assert isinstance(inputs, list) and all(
            isinstance(x, str) for x in inputs
        ), f"inputs must be list[str], got {type(inputs)} containing {[type(x).__name__ for x in inputs[:3]]}"

        with httpx.Client(timeout=self.timeout) as client:
            resp = client.post(url, headers=headers, json=payload)
        if resp.status_code >= 400:
            # 把厂商原始错误抛上去，便于前端显示 + 同时打印我们的请求摘要
            logger.error(
                "[embed] %s returned %d. our payload: model=%s input.type=list[str] len=%d",
                url,
                resp.status_code,
                self.model,
                len(inputs),
            )
            raise RuntimeError(
                f"Error code: {resp.status_code} - {resp.text}"
            )
        data = resp.json()
        items = data.get("data") or []
        items.sort(key=lambda r: r.get("index", 0))
        return [item["embedding"] for item in items]

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        results: List[List[float]] = []
        # 防御：空串会让百炼报另一种错误，过滤掉
        clean = [t if (t and t.strip()) else " " for t in texts]
        for i in range(0, len(clean), self.batch_size):
            batch = clean[i : i + self.batch_size]
            results.extend(self._post(batch))
        return results

    def embed_query(self, text: str) -> List[float]:
        text = text if (text and text.strip()) else " "
        return self._post([text])[0]


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
        # 用自前实现的极简客户端，确保 input 永远是 list[str]，
        # 兼容通义千问百炼 / 智谱 / DeepSeek / OpenAI 官方。
        model_name = self.embedding_model() or ""
        if "multimodal" in model_name.lower():
            raise RuntimeError(
                f"embedding_model='{model_name}' 看起来是多模态模型，"
                "DashScope 多模态 embedding 接口需要 input.contents 结构，"
                "本系统只支持纯文本 embedding。请改用 text-embedding-v3 / "
                "text-embedding-v2 / text-embedding-v1 等纯文本模型。"
            )
        logger.info(
            "[provider %s] build embeddings: base_url=%s model=%s (SimpleOpenAIEmbeddings)",
            self.name(),
            self.base_url(),
            model_name,
        )
        return _SimpleOpenAIEmbeddings(
            base_url=self.base_url(),
            api_key=self.api_key(),
            model=model_name,
            batch_size=10,
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
