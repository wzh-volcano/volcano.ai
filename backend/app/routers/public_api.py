"""Public REST API for Studio apps — authenticated via API Key (X-API-Key header).
"""
import json
from datetime import datetime
from hashlib import sha256

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import ApiKey, App, Conversation, Message
from ..services.chat_service import chat_with_app_config

router = APIRouter(prefix="/api/public", tags=["public"])


def _verify_api_key(
    app_id: int,
    api_key: str = Header(None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> App:
    """Verify the API key and return the authorized App."""
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="缺少 X-API-Key header",
        )

    key_hash = sha256(api_key.encode()).hexdigest()
    api_key_obj = db.scalar(
        select(ApiKey).where(ApiKey.key_hash == key_hash)
    )
    if not api_key_obj:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API Key 无效",
        )

    app = db.get(App, app_id)
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="应用不存在")
    if app.owner_id != api_key_obj.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="应用不存在")
    if not app.api_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="应用不存在",
        )

    api_key_obj.last_used_at = datetime.utcnow()
    db.commit()

    return app


def _get_conv_or_404(conv_id: int, app_id: int, owner_id: int, db: Session) -> Conversation:
    conv = db.get(Conversation, conv_id)
    if not conv or conv.app_id != app_id or conv.owner_id != owner_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="会话不存在")
    return conv


@router.post("/apps/{app_id}/conversations", status_code=201, response_model=schemas.ConversationOut)
def create_conversation(
    app_id: int,
    payload: schemas.ConversationCreate,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> schemas.ConversationOut:
    """Create a new conversation for the app (owned by the app's owner)."""
    conv = Conversation(
        app_id=app_id,
        title=payload.title or "",
        owner_id=app.owner_id,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return schemas.ConversationOut(
        id=conv.id,
        app_id=conv.app_id,
        title=conv.title,
        summary=conv.summary,
        message_count=conv.message_count,
        owner_id=conv.owner_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


@router.get("/apps/{app_id}/conversations/{conv_id}/messages", response_model=list[schemas.MessageOut])
def list_messages(
    app_id: int,
    conv_id: int,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> list[schemas.MessageOut]:
    """List all messages in a conversation."""
    conv = _get_conv_or_404(conv_id, app_id, app.owner_id, db)
    messages = db.scalars(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at.asc())
    ).all()
    return messages


@router.delete("/apps/{app_id}/conversations/{conv_id}", status_code=204)
def delete_conversation(
    app_id: int,
    conv_id: int,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
) -> None:
    """Delete a conversation."""
    conv = _get_conv_or_404(conv_id, app_id, app.owner_id, db)
    db.delete(conv)
    db.commit()


@router.post("/apps/{app_id}/conversations/{conv_id}/chat")
def chat(
    app_id: int,
    conv_id: int,
    payload: schemas.AppChatRequest,
    app: App = Depends(_verify_api_key),
    db: Session = Depends(get_db),
):
    """Send a message and stream the response (SSE). Messages are persisted.

    The request body supports the same fields as the internal chat endpoint:
    {question, messages?} where messages is an optional array of prior
    {role, content} objects for multi-turn context.
    """
    conv = _get_conv_or_404(conv_id, app_id, app.owner_id, db)

    result = chat_with_app_config(
        app=app,
        question=payload.question,
        stream=True,
        db=db,
        messages=payload.messages,
    )

    original_stream = result.body_iterator

    async def persist_and_stream():
        full_response = ""
        async for chunk_str in original_stream:
            yield chunk_str
            for line in chunk_str.split("\n"):
                if line.startswith("data: "):
                    try:
                        data = json.loads(line[6:])
                        if "token" in data:
                            full_response += data["token"]
                    except json.JSONDecodeError:
                        pass

        now = datetime.utcnow()
        if payload.question:
            db.add(Message(
                conversation_id=conv_id,
                role="user",
                content=payload.question,
                token_count=0,
                created_at=now,
            ))
        if full_response:
            db.add(Message(
                conversation_id=conv_id,
                role="assistant",
                content=full_response,
                token_count=0,
                created_at=now,
            ))
        conv.message_count = (
            db.scalar(
                select(func.count(Message.id))
                .where(Message.conversation_id == conv_id)
            ) or 0
        )
        db.commit()

    return StreamingResponse(persist_and_stream(), media_type="text/event-stream")
