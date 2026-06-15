"""RAG 问答链：retriever → prompt → llm。

不使用复杂的 LCEL Runnable，直接组合，便于阅读与调试。
"""
from __future__ import annotations

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from sqlalchemy.orm import Session

from ..config import settings
from ..models import KnowledgeBase
from ..providers import get_current
from . import vectorstore

# 提示模板：强约束「仅依据上下文回答，否则承认不知道」
_SYSTEM = """你是一个严谨的知识库问答助手。请仅根据下面给出的「参考资料」回答用户问题。
如果参考资料中没有相关信息，请直接回答「根据当前知识库无法回答该问题」，不要编造。
回答用中文，简明扼要。"""

_HUMAN = """参考资料：
{context}

问题：{question}
"""


def _build_context(chunks: list) -> str:
    parts = []
    for i, (chunk, score) in enumerate(chunks, 1):
        parts.append(f"[{i}] (相关度 {score:.2f}) {chunk.content}")
    return "\n\n".join(parts) if parts else "（无相关资料）"


def answer_question(
    db: Session, kb: KnowledgeBase, question: str, top_k: int | None = None
) -> dict:
    provider = get_current(db)
    embeddings = provider.get_embeddings()
    llm = provider.get_llm()

    # 1. 检索
    retrieved = vectorstore.search(
        db,
        kb_id=kb.id,
        query=question,
        embeddings_model=embeddings,
        top_k=top_k or settings.default_top_k,
    )

    # 2. 组装 prompt
    prompt = ChatPromptTemplate.from_messages([("system", _SYSTEM), ("human", _HUMAN)])
    chain = prompt | llm | StrOutputParser()

    # 3. 生成
    answer = chain.invoke(
        {"context": _build_context(retrieved), "question": question}
    )

    return {
        "answer": answer,
        "sources": [
            {"document": c.document.filename if c.document else "?", "content": c.content, "score": s}
            for c, s in retrieved
        ],
    }
