"""知识库 CRUD 路由。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..database import get_db
from ..models import KnowledgeBase
from ..providers import get_current

router = APIRouter(prefix="/api/kb", tags=["knowledge-bases"])


@router.post("", response_model=schemas.KBOut, status_code=201)
def create_kb(payload: schemas.KBCreate, db: Session = Depends(get_db)) -> KnowledgeBase:
    provider = get_current()
    kb = KnowledgeBase(
        name=payload.name,
        description=payload.description,
        visibility=payload.visibility,
        provider=provider.name(),
        embedding_model=payload.embedding_model or settings.embedding_model,
        chunk_size=payload.chunk_size,
        chunk_overlap=payload.chunk_overlap,
        doc_count=0,
        chunk_count=0,
        status="ready",
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return kb


@router.get("", response_model=list[schemas.KBOut])
def list_kb(db: Session = Depends(get_db)) -> list[KnowledgeBase]:
    return list(db.scalars(select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())))


@router.get("/{kb_id}", response_model=schemas.KBOut)
def get_kb(kb_id: int, db: Session = Depends(get_db)) -> KnowledgeBase:
    kb = db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    return kb


@router.delete("/{kb_id}", status_code=204)
def delete_kb(kb_id: int, db: Session = Depends(get_db)) -> None:
    kb = db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    db.delete(kb)
    db.commit()
