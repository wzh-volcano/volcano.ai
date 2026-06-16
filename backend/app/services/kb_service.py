"""知识库服务：文档入库（加载 → 切分 → 向量化 → 写库 → 计数）。"""
from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..models import Chunk, Document, KnowledgeBase
from ..providers import get_current_embedding
from ..rag.loader import load_file
from ..rag.splitter import split_documents
from ..rag.vectorstore import embedding_to_bytes, store_chunks


def index_document(
    db: Session, kb: KnowledgeBase, doc: Document, file_path: Path
) -> None:
    """首次索引：切分 + 向量化 + 入库，并把 KB 的 doc_count / chunk_count 累加上去。"""
    _do_index(db, kb, doc, file_path, increment_doc_count=True)


def reindex_document(db: Session, kb: KnowledgeBase, doc: Document) -> None:
    """重新分片：清掉旧 chunks，把 KB 的 chunk_count 减回去，再走一遍切分流程。

    不增加 KB.doc_count（文档本身不算新增）。
    """
    if not doc.file_path:
        raise FileNotFoundError("原始文件路径未记录，无法再次分片，请重新上传")

    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"原始文件已丢失：{doc.file_path}，请重新上传")

    # 1. 清旧分片，并把 kb.chunk_count 减回去
    old_count = doc.chunk_count or 0
    db.execute(delete(Chunk).where(Chunk.doc_id == doc.id))
    kb.chunk_count = max(0, (kb.chunk_count or 0) - old_count)
    doc.chunk_count = 0
    doc.status = "indexing"
    db.commit()

    # 2. 走切分 + 向量化 + 入库流程，但不能再 +1 doc_count
    _do_index(db, kb, doc, file_path, increment_doc_count=False)


def _do_index(
    db: Session,
    kb: KnowledgeBase,
    doc: Document,
    file_path: Path,
    *,
    increment_doc_count: bool,
) -> None:
    """将单个文档切分并向量化后写入 chunks 表，并更新 KB 与文档的统计字段。"""
    # 1. 加载
    pages = load_file(file_path)

    # 2. 切分（传入 KB 的分段策略）
    method = kb.chunk_method or "general_auto"
    separators = _load_separators(kb)
    parent_chunk_size = _load_parent_chunk_size(kb)

    chunks = split_documents(
        pages,
        method=method,
        chunk_size=kb.chunk_size,
        chunk_overlap=kb.chunk_overlap,
        separators=separators,
        parent_chunk_size=parent_chunk_size,
    )

    # 3. 向量化 + 入库（embedding 走 embedding-active 的插件）
    provider = get_current_embedding(db)
    embeddings = provider.get_embeddings()

    if method == "parent_child":
        count = _store_parent_child_chunks(
            db, kb_id=kb.id, doc_id=doc.id,
            chunks=chunks, embeddings_model=embeddings,
        )
    else:
        texts = [c.page_content for c in chunks]
        count = store_chunks(
            db, kb_id=kb.id, doc_id=doc.id,
            texts=texts, embeddings_model=embeddings,
        )

    # 4. 更新统计
    doc.chunk_count = count
    doc.status = "ready"
    kb.chunk_count = (kb.chunk_count or 0) + count
    if increment_doc_count:
        kb.doc_count = (kb.doc_count or 0) + 1
    kb.status = "ready"
    db.commit()


def _load_separators(kb: KnowledgeBase) -> list[str] | None:
    """从 KB 的 extra_json 中加载自定义分隔符（general_custom 模式）。"""
    try:
        extra = json.loads(kb.extra_json) if hasattr(kb, "extra_json") and kb.extra_json else {}
        return extra.get("separators")
    except (json.JSONDecodeError, AttributeError):
        return None


def _load_parent_chunk_size(kb: KnowledgeBase) -> int | None:
    """从 KB 的 extra_json 中加载父块大小（parent_child 模式）。"""
    try:
        extra = json.loads(kb.extra_json) if hasattr(kb, "extra_json") and kb.extra_json else {}
        return extra.get("parent_chunk_size")
    except (json.JSONDecodeError, AttributeError):
        return None


def _store_parent_child_chunks(
    db: Session,
    kb_id: int,
    doc_id: int,
    chunks: list,
    embeddings_model,
) -> int:
    """父子分段模式存储：父块和子块分别存储，子块引用父块。

    父块的 embedding 存在自身的 embedding 字段中。
    子块的 parent_chunk_id 指向父块，parent_content 存储父块完整内容。
    子块也有自己的 embedding（用于检索匹配）。
    """
    from langchain_core.documents import Document as LCDoc  # noqa: F811

    # 分离父块和子块
    parents: list[tuple[LCDoc, int]] = []  # (doc, parent_index)
    children: list[tuple[LCDoc, int]] = []  # (doc, parent_index)

    for chunk in chunks:
        role = chunk.metadata.get("chunk_role", "")
        p_idx = chunk.metadata.get("parent_index", -1)
        if role == "parent":
            parents.append((chunk, p_idx))
        elif role == "child":
            children.append((chunk, p_idx))

    if not parents:
        # 回退：当作普通切分处理
        texts = [c.page_content for c in chunks]
        return store_chunks(db, kb_id=kb_id, doc_id=doc_id, texts=texts, embeddings_model=embeddings_model)

    # 批量向量化所有文本（父块 + 子块）
    all_texts = [c.page_content for c, _ in parents + children]
    all_vectors = embeddings_model.embed_documents(all_texts)
    vec_idx = 0

    # 存储父块
    parent_id_map: dict[int, int] = {}  # parent_index → chunk.id
    for chunk_doc, p_idx in parents:
        vec = all_vectors[vec_idx]
        vec_idx += 1
        row = Chunk(
            kb_id=kb_id,
            doc_id=doc_id,
            content=chunk_doc.page_content,
            embedding=embedding_to_bytes(vec),
            token_count=len(chunk_doc.page_content),
        )
        db.add(row)
        db.flush()
        parent_id_map[p_idx] = row.id

    # 存储子块（引用父块）
    for chunk_doc, p_idx in children:
        vec = all_vectors[vec_idx]
        vec_idx += 1
        parent_id = parent_id_map.get(p_idx)
        parent_content = None
        if parent_id is not None:
            # 从 parents 列表中找到对应的父块内容
            for p_doc, p_i in parents:
                if p_i == p_idx:
                    parent_content = p_doc.page_content
                    break
        row = Chunk(
            kb_id=kb_id,
            doc_id=doc_id,
            content=chunk_doc.page_content,
            embedding=embedding_to_bytes(vec),
            token_count=len(chunk_doc.page_content),
            parent_chunk_id=parent_id,
            parent_content=parent_content,
        )
        db.add(row)
        db.flush()

    return len(parents) + len(children)
