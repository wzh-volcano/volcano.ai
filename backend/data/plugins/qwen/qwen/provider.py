from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel


class QwenProvider:
    _name = "qwen"
    _label = "千问百炼"

    def __init__(self, config: dict | None = None) -> None:
        self._config = config or {}

    def name(self) -> str:
        return self._name

    def label(self) -> str:
        return self._label

    def available(self) -> bool:
        try:
            import langchain_openai
            return True
        except ImportError:
            return False

    def configured(self) -> bool:
        return bool(self.base_url() and self.api_key() and self.llm_model())

    def base_url(self) -> str:
        return self._config.get("base_url") or "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def api_key(self) -> str:
        return self._config.get("api_key", "")

    def llm_model(self) -> str:
        return self._config.get("llm_model") or "qwen-plus"

    def embedding_model(self) -> str:
        return self._config.get("embedding_model") or "text-embedding-v3"

    def get_llm(self) -> BaseChatModel:
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=self.llm_model(),
            base_url=self.base_url(),
            api_key=self.api_key(),
            temperature=0.3,
        )

    def get_embeddings(self) -> Embeddings:
        # 通义百炼 DashScope 兼容端点对 input 字段挑剔，必须是 list[str]，
        # 而 langchain-openai 的 OpenAIEmbeddings 默认会用 tiktoken 把文本预切成
        # token id 数组发出去，DashScope 会报 "contents is neither str nor list of str"。
        # 这里直接 httpx 调原始 /embeddings 接口，绕开所有中间封装。
        from typing import List

        import httpx

        base_url = self.base_url().rstrip("/")
        api_key = self.api_key()
        model = self.embedding_model()

        if "multimodal" in model.lower():
            raise RuntimeError(
                f"embedding_model='{model}' 是多模态模型，DashScope 多模态 embedding "
                "需要 input.contents 结构，本系统只支持纯文本 embedding。请改用 "
                "text-embedding-v3 / text-embedding-v2 / text-embedding-v1。"
            )

        class _QwenTextEmbeddings(Embeddings):
            def __init__(self, url: str, key: str, mdl: str) -> None:
                self._url = f"{url}/embeddings"
                self._key = key
                self._model = mdl

            def _post(self, inputs: List[str]) -> List[List[float]]:
                clean = [(t if (t and t.strip()) else " ") for t in inputs]
                payload = {"model": self._model, "input": clean}
                with httpx.Client(timeout=60.0) as client:
                    resp = client.post(
                        self._url,
                        headers={
                            "Authorization": f"Bearer {self._key}",
                            "Content-Type": "application/json",
                        },
                        json=payload,
                    )
                if resp.status_code >= 400:
                    raise RuntimeError(
                        f"Error code: {resp.status_code} - {resp.text}"
                    )
                data = resp.json()
                items = data.get("data") or []
                items.sort(key=lambda r: r.get("index", 0))
                return [item["embedding"] for item in items]

            def embed_documents(self, texts: List[str]) -> List[List[float]]:
                # 百炼单次最多 10 条
                results: List[List[float]] = []
                for i in range(0, len(texts), 10):
                    results.extend(self._post(texts[i : i + 10]))
                return results

            def embed_query(self, text: str) -> List[float]:
                return self._post([text])[0]

        return _QwenTextEmbeddings(base_url, api_key, model)

    def list_models(self) -> list[str]:
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
        return sorted(dict.fromkeys(models))

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
