"""智谱 GLM Provider（OpenAI 兼容协议）。"""
from __future__ import annotations

from .openai_like import OpenAILikeProvider


class ZhipuProvider(OpenAILikeProvider):
    """智谱 BigModel 走 OpenAI 兼容端点，仅默认 base_url 不同。"""

    def __init__(self, config: dict | None = None) -> None:
        super().__init__(
            name="zhipu",
            label="智谱 GLM",
            base_url="https://open.bigmodel.cn/api/paas/v4",
            config=config,
        )
