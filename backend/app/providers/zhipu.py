"""智谱 GLM Provider（OpenAI 兼容协议）。"""
from __future__ import annotations

from ..config import settings
from .openai_like import OpenAILikeProvider


class ZhipuProvider(OpenAILikeProvider):
    """智谱 BigModel 走 OpenAI 兼容端点，仅默认 base_url 不同。"""

    def __init__(self) -> None:
        super().__init__(
            name="zhipu",
            label="智谱 GLM",
            base_url="https://open.bigmodel.cn/api/paas/v4",
        )

    def base_url(self) -> str:
        # 未在 .env 配置时回退到智谱默认端点
        return settings.llm_base_url or self._base_url
