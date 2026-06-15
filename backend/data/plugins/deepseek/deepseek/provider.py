from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel


class DeepSeekProvider:
    _name = "deepseek"
    _label = "DeepSeek"

    def __init__(self, config: dict | None = None) -> None:
        self._config = config or {}

    def name(self) -> str:
        return self._name

    def label(self) -> str:
        return self._label

    def available(self) -> bool:
        try:
            import langchain_openai  # noqa: F401
            return True
        except ImportError:
            return False

    def configured(self) -> bool:
        return bool(self.base_url() and self.api_key() and self.llm_model())

    def base_url(self) -> str:
        return self._config.get("base_url") or "https://api.deepseek.com/v1"

    def api_key(self) -> str:
        return self._config.get("api_key", "")

    def llm_model(self) -> str:
        return self._config.get("llm_model") or "deepseek-chat"

    def embedding_model(self) -> str:
        return self._config.get("embedding_model") or ""

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
