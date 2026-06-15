"""知识库 CRUD 路由。

权限规则：
- 普通用户只能看到/操作自己创建的知识库（owner_id == current_user.id）
- 管理员可以看到/操作所有知识库
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import KnowledgeBase, User
from ..providers import get_current

router = APIRouter(prefix="/api/kb", tags=["knowledge-bases"])


def _to_out(kb: KnowledgeBase) -> dict:
    """把 KB 转成包含 owner_username 的 dict 给 KBOut。"""
    return {
        "id": kb.id,
        "name": kb.name,
        "description": kb.description,
        "visibility": kb.visibility,
        "provider": kb.provider,
        "embedding_model": kb.embedding_model,
        "chunk_size": kb.chunk_size,
        "chunk_overlap": kb.chunk_overlap,
        "doc_count": kb.doc_count,
        "chunk_count": kb.chunk_count,
        "status": kb.status,
        "owner_id": kb.owner_id,
        "owner_username": kb.owner.username if kb.owner is not None else None,
        "created_at": kb.created_at,
    }


def get_kb_or_403(
    kb_id: int,
    db: Session,
    current_user: User,
) -> KnowledgeBase:
    """加载 kb 并校验访问权限：管理员放行，普通用户必须是 owner。"""
    kb = db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if current_user.role != "admin" and kb.owner_id != current_user.id:
        # 普通用户访问别人的知识库，直接返回 404 避免泄露存在性
        raise HTTPException(status_code=404, detail="知识库不存在")
    return kb


@router.post("", response_model=schemas.KBOut, status_code=201)
def create_kb(
    payload: schemas.KBCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    provider = get_current(db)
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
        owner_id=current_user.id,
    )
    db.add(kb)
    db.commit()
    db.refresh(kb)
    return _to_out(kb)


@router.get("", response_model=list[schemas.KBOut])
def list_kb(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    stmt = select(KnowledgeBase).order_by(KnowledgeBase.created_at.desc())
    if current_user.role != "admin":
        stmt = stmt.where(KnowledgeBase.owner_id == current_user.id)
    return [_to_out(kb) for kb in db.scalars(stmt)]


@router.get("/{kb_id}", response_model=schemas.KBOut)
def get_kb(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    kb = get_kb_or_403(kb_id, db, current_user)
    return _to_out(kb)


@router.delete("/{kb_id}", status_code=204)
def delete_kb(
    kb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    kb = get_kb_or_403(kb_id, db, current_user)
    db.delete(kb)
    db.commit()
