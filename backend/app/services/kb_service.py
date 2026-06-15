"""知识库服务：文档入库（加载 → 切分 → 向量化 → 写库 → 计数）。"""
from pathlib import Path

from sqlalchemy.orm import Session

from ..models import Document, KnowledgeBase
from ..providers import get_current
from ..rag.loader import load_file
from ..rag.splitter import split_documents
from ..rag.vectorstore import store_chunks


def index_document(
    db: Session, kb: KnowledgeBase, doc: Document, file_path: Path
) -> None:
    """将单个文档切分并向量化后写入 chunks 表，并更新 KB 与文档的统计字段。"""
    # 1. 加载
    pages = load_file(file_path)

    # 2. 切分
    chunks = split_documents(pages, kb.chunk_size, kb.chunk_overlap)
    texts = [c.page_content for c in chunks]

    # 3. 向量化 + 入库（用 KB 锁定的 provider/embedding_model）
    provider = get_current(db)
    embeddings = provider.get_embeddings()
    count = store_chunks(db, kb_id=kb.id, doc_id=doc.id, texts=texts, embeddings_model=embeddings)

    # 4. 更新统计
    doc.chunk_count = count
    doc.status = "ready"
    kb.chunk_count = (kb.chunk_count or 0) + count
    kb.doc_count = (kb.doc_count or 0) + 1
    kb.status = "ready"
    db.commit()
