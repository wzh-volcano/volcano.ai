"""对话持久化路由：CRUD + 消息管理。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import Conversation, Message, User

router = APIRouter(tags=["conversations"])


def _get_conv_or_404(conv_id: int, db: Session, current_user: User) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    if current_user.role != "admin" and conv.owner_id != current_user.id:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conv


def _conv_to_out(conv: Conversation) -> dict:
    return {
        "id": conv.id,
        "app_id": conv.app_id,
        "title": conv.title,
        "summary": conv.summary,
        "message_count": conv.message_count,
        "owner_id": conv.owner_id,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
    }


# ========== Conversation CRUD ==========


@router.get("/api/apps/{app_id}/conversations", response_model=list[schemas.ConversationOut])
def list_conversations(
    app_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """列出某个 App 下的所有对话（按 updated_at 倒序）。"""
    stmt = (
        select(Conversation)
        .where(Conversation.app_id == app_id)
        .order_by(Conversation.updated_at.desc())
    )
    if current_user.role != "admin":
        stmt = stmt.where(Conversation.owner_id == current_user.id)
    return [_conv_to_out(c) for c in db.scalars(stmt)]


@router.post("/api/apps/{app_id}/conversations", response_model=schemas.ConversationOut, status_code=201)
def create_conversation(
    app_id: int,
    payload: schemas.ConversationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """创建新对话。"""
    conv = Conversation(
        app_id=app_id,
        title=payload.title,
        owner_id=current_user.id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return _conv_to_out(conv)


@router.get("/api/conversations/{conv_id}", response_model=schemas.ConversationOut)
def get_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    conv = _get_conv_or_404(conv_id, db, current_user)
    return _conv_to_out(conv)


@router.patch("/api/conversations/{conv_id}", response_model=schemas.ConversationOut)
def update_conversation(
    conv_id: int,
    payload: schemas.ConversationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    conv = _get_conv_or_404(conv_id, db, current_user)
    if payload.title is not None:
        conv.title = payload.title
    if payload.summary is not None:
        conv.summary = payload.summary
    db.commit()
    db.refresh(conv)
    return _conv_to_out(conv)


@router.delete("/api/conversations/{conv_id}", status_code=204)
def delete_conversation(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    conv = _get_conv_or_404(conv_id, db, current_user)
    db.delete(conv)
    db.commit()


# ========== Messages ==========


@router.get("/api/conversations/{conv_id}/messages", response_model=list[schemas.MessageOut])
def list_messages(
    conv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """列出对话的所有消息（按 created_at 升序）。"""
    _get_conv_or_404(conv_id, db, current_user)
    stmt = (
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
    )
    rows = db.scalars(stmt).all()
    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "token_count": m.token_count,
            "created_at": m.created_at,
        }
        for m in rows
    ]


@router.post("/api/conversations/{conv_id}/messages", response_model=list[schemas.MessageOut], status_code=201)
def add_messages(
    conv_id: int,
    payload: schemas.MessagesBatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """批量追加消息（如一次写入 user + assistant 两条）。更新 conversation 的 message_count。"""
    conv = _get_conv_or_404(conv_id, db, current_user)

    saved: list[Message] = []
    for m in payload.messages:
        msg = Message(
            conversation_id=conv_id,
            role=m.role,
            content=m.content,
            token_count=len(m.content),
        )
        db.add(msg)
        saved.append(msg)
        db.flush()

    conv.message_count = (conv.message_count or 0) + len(payload.messages)
    db.commit()

    for m in saved:
        db.refresh(m)

    return [
        {
            "id": m.id,
            "conversation_id": m.conversation_id,
            "role": m.role,
            "content": m.content,
            "token_count": m.token_count,
            "created_at": m.created_at,
        }
        for m in saved
    ]
