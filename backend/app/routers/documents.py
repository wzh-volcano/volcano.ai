"""文档上传 / 列表 / 删除路由。"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Chunk, Document, KnowledgeBase, User
from ..services.kb_service import index_document, reindex_document
from .knowledge_bases import get_kb_or_403

router = APIRouter(tags=["documents"])

# 文件扩展名 → file_type
_EXT_MAP = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "docx",
    ".md": "markdown",
    ".markdown": "markdown",
    ".txt": "text",
    ".csv": "csv",
    ".html": "html",
    ".htm": "html",
}


def _file_type(filename: str) -> str:
    return _EXT_MAP.get(Path(filename).suffix.lower(), "other")


@router.post(
    "/api/kb/{kb_id}/documents/text",
    response_model=schemas.DocumentOut,
    status_code=201,
)
def upload_text_document(
    kb_id: int,
    payload: schemas.TextDocumentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    """通过粘贴文本内容创建文档（支持 Markdown / 纯文本）。"""
    kb = get_kb_or_403(kb_id, db, current_user)

    ext = ".md" if payload.file_type == "md" else ".txt"

    doc = Document(
        kb_id=kb_id,
        filename=payload.title,
        file_type=payload.file_type,
        file_size=len(payload.content.encode("utf-8")),
        status="indexing",
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    # 拿到 doc.id 后再确定文件名，保证唯一可回查
    save_name = f"{kb_id}_text_{doc.id}{ext}"
    save_path = settings.upload_path / save_name
    save_path.write_text(payload.content, encoding="utf-8")
    doc.file_path = str(save_path)
    db.commit()

    try:
        index_document(db, kb, doc, save_path)
    except Exception as e:  # noqa: BLE001
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"索引失败: {e}") from e

    return doc


@router.post(
    "/api/kb/{kb_id}/documents",
    response_model=list[schemas.DocumentOut],
    status_code=201,
)
async def upload_documents(
    kb_id: int,
    files: list[UploadFile],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Document]:
    kb = get_kb_or_403(kb_id, db, current_user)

    saved: list[Document] = []
    for f in files:
        content = await f.read()
        if len(content) > settings.max_file_size_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"{f.filename} 超过 {settings.max_file_size_mb}MB 限制",
            )

        ext = Path(f.filename or "").suffix

        # 先写入 Document 行，拿到 doc.id 后再以 {kb}_{doc_id}{ext} 命名落盘，
        # 这样多次上传不会互相覆盖，也方便后续"再次分片"找回原文件。
        doc = Document(
            kb_id=kb_id,
            filename=f.filename or "",
            file_type=_file_type(f.filename or ""),
            file_size=len(content),
            status="indexing",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

        save_name = f"{kb_id}_{doc.id}{ext}"
        save_path = settings.upload_path / save_name
        save_path.write_bytes(content)

        if not doc.filename:
            doc.filename = save_name
        doc.file_path = str(save_path)
        db.commit()

        # 切分 + 向量化 + 入库
        try:
            index_document(db, kb, doc, save_path)
        except Exception as e:  # noqa: BLE001
            doc.status = "error"
            db.commit()
            raise HTTPException(status_code=500, detail=f"索引失败: {e}") from e

        saved.append(doc)

    return saved


@router.get("/api/kb/{kb_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Document]:
    get_kb_or_403(kb_id, db, current_user)
    return list(
        db.scalars(
            select(Document).where(Document.kb_id == kb_id).order_by(Document.created_at.desc())
        )
    )


@router.get(
    "/api/documents/{doc_id}/chunks",
    response_model=list[schemas.ChunkOut],
)
def list_document_chunks(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Chunk]:
    """返回某个文档的所有分片，按 id 升序（即落库顺序）。"""
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    kb = db.get(KnowledgeBase, doc.kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if current_user.role != "admin" and kb.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="文档不存在")

    return list(
        db.scalars(
            select(Chunk)
            .where(Chunk.doc_id == doc_id)
            .order_by(Chunk.id.asc())
        )
    )


@router.patch("/api/chunks/{chunk_id}", response_model=schemas.ChunkOut)
def update_chunk(
    chunk_id: int,
    payload: schemas.ChunkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Chunk:
    """修改分片内容。"""
    chunk = db.get(Chunk, chunk_id)
    if chunk is None:
        raise HTTPException(status_code=404, detail="分片不存在")

    doc = db.get(Document, chunk.doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    kb = db.get(KnowledgeBase, doc.kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if current_user.role != "admin" and kb.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="分片不存在")

    chunk.content = payload.content
    db.commit()
    db.refresh(chunk)
    return chunk


@router.delete("/api/documents/{doc_id}", status_code=204)
def delete_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    kb = db.get(KnowledgeBase, doc.kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if current_user.role != "admin" and kb.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="文档不存在")

    db.delete(doc)  # chunks 因 cascade 一并删除
    db.commit()

    # 同步知识库计数
    kb.doc_count = max(0, kb.doc_count - 1)
    db.commit()


def _get_doc_with_kb(
    doc_id: int, db: Session, current_user: User
) -> tuple[Document, KnowledgeBase]:
    """加载文档 + 所属 KB，并校验当前用户拥有权限。"""
    doc = db.get(Document, doc_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="文档不存在")

    kb = db.get(KnowledgeBase, doc.kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if current_user.role != "admin" and kb.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="文档不存在")
    return doc, kb


@router.post(
    "/api/documents/{doc_id}/reindex",
    response_model=schemas.DocumentOut,
)
def reindex_one_document(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    """对单个文档重新分片：清掉旧 chunks，再走一遍切分流程。"""
    doc, kb = _get_doc_with_kb(doc_id, db, current_user)
    try:
        reindex_document(db, kb, doc)
    except FileNotFoundError as e:
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # noqa: BLE001
        doc.status = "error"
        db.commit()
        raise HTTPException(status_code=500, detail=f"再次分片失败: {e}") from e
    return doc


@router.post(
    "/api/kb/{kb_id}/documents/reindex-batch",
    response_model=schemas.ReindexBatchResponse,
)
def reindex_documents_batch(
    kb_id: int,
    payload: schemas.ReindexBatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> schemas.ReindexBatchResponse:
    """批量重新分片，顺序执行；单条失败不影响其它文档，错误信息回传给前端。"""
    kb = get_kb_or_403(kb_id, db, current_user)

    results: list[schemas.ReindexBatchItemResult] = []
    for doc_id in payload.doc_ids:
        doc = db.get(Document, doc_id)
        if doc is None or doc.kb_id != kb.id:
            results.append(schemas.ReindexBatchItemResult(
                doc_id=doc_id, status="error", error="文档不存在或不属于该知识库",
            ))
            continue
        try:
            reindex_document(db, kb, doc)
            results.append(schemas.ReindexBatchItemResult(
                doc_id=doc_id, status="ready",
            ))
        except FileNotFoundError as e:
            doc.status = "error"
            db.commit()
            results.append(schemas.ReindexBatchItemResult(
                doc_id=doc_id, status="error", error=str(e),
            ))
        except Exception as e:  # noqa: BLE001
            doc.status = "error"
            db.commit()
            results.append(schemas.ReindexBatchItemResult(
                doc_id=doc_id, status="error", error=f"再次分片失败: {e}",
            ))

    return schemas.ReindexBatchResponse(results=results)


@router.post(
    "/api/documents/{doc_id}/toggle-enabled",
    response_model=schemas.DocumentOut,
)
def toggle_one_document_enabled(
    doc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Document:
    """切换单个文档的 enabled 状态（启用 ↔ 禁用）。"""
    doc, _kb = _get_doc_with_kb(doc_id, db, current_user)
    doc.enabled = not bool(doc.enabled)
    db.commit()
    db.refresh(doc)
    return doc


@router.post(
    "/api/kb/{kb_id}/documents/toggle-enabled",
    response_model=list[schemas.DocumentOut],
)
def toggle_documents_enabled_batch(
    kb_id: int,
    payload: schemas.ToggleEnabledRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Document]:
    """批量将一批文档统一设为启用 / 禁用。"""
    kb = get_kb_or_403(kb_id, db, current_user)

    updated: list[Document] = []
    for doc_id in payload.doc_ids:
        doc = db.get(Document, doc_id)
        if doc is None or doc.kb_id != kb.id:
            continue
        doc.enabled = bool(payload.enabled)
        updated.append(doc)
    db.commit()
    for d in updated:
        db.refresh(d)
    return updated
