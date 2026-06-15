"""纯 SQLite 向量存储。

设计：
- embedding 以 numpy.float32 raw bytes 存入 chunks.embedding (BLOB)
- 检索时从该 KB 全部 chunk 还原为矩阵，对 query 向量做余弦相似度，取 top_k

适用规模：演示级（数千 chunk）。生产建议换 sqlite-vec / FAISS / Chroma。
"""
from __future__ import annotations

import numpy as np
from langchain_core.embeddings import Embeddings
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Chunk


# ---------- 序列化 / 反序列化 ----------
def embedding_to_bytes(vec: list[float]) -> bytes:
    """float list → float32 raw bytes。"""
    return np.asarray(vec, dtype=np.float32).tobytes()


def bytes_to_embedding(data: bytes) -> np.ndarray:
    """float32 raw bytes → ndarray。"""
    return np.frombuffer(data, dtype=np.float32)


# ---------- 写入 ----------
def store_chunks(
    db: Session,
    kb_id: int,
    doc_id: int,
    texts: list[str],
    embeddings_model: Embeddings,
) -> int:
    """对文本批量向量化并写入 chunks 表，返回写入条数。"""
    if not texts:
        return 0

    vectors = embeddings_model.embed_documents(texts)
    rows = [
        Chunk(
            kb_id=kb_id,
            doc_id=doc_id,
            content=text,
            embedding=embedding_to_bytes(vec),
            token_count=len(text),
        )
        for text, vec in zip(texts, vectors, strict=True)
    ]
    db.add_all(rows)
    db.flush()
    return len(rows)


# ---------- 检索 ----------
def search(
    db: Session,
    kb_id: int,
    query: str,
    embeddings_model: Embeddings,
    top_k: int = 4,
) -> list[tuple[Chunk, float]]:
    """检索与 query 最相似的 top_k 个 chunk，返回 (chunk, score) 列表。"""
    chunks = list(
        db.scalars(
            select(Chunk).where(
                Chunk.kb_id == kb_id,
                Chunk.embedding.is_not(None),
            )
        )
    )
    if not chunks:
        return []

    query_vec = np.asarray(
        embeddings_model.embed_query(query), dtype=np.float32
    )

    # 构建矩阵并归一化
    matrix = np.vstack([bytes_to_embedding(c.embedding) for c in chunks])
    q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-8)
    m_norm = matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-8)

    scores = m_norm @ q_norm  # 余弦相似度
    top_idx = np.argsort(scores)[-top_k:][::-1]

    return [(chunks[i], float(scores[i])) for i in top_idx]
