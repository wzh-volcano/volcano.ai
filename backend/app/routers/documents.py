"""文档上传 / 列表 / 删除路由。"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Document, KnowledgeBase, User
from ..services.kb_service import index_document
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

        # 落盘
        ext = Path(f.filename or "").suffix
        save_name = f"{kb_id}_{len(saved)}{ext}"
        save_path = settings.upload_path / save_name
        save_path.write_bytes(content)

        doc = Document(
            kb_id=kb_id,
            filename=f.filename or save_name,
            file_type=_file_type(f.filename or ""),
            file_size=len(content),
            status="indexing",
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)

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
