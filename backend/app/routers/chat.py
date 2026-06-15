"""RAG 问答路由。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..deps import get_current_user
from ..models import User
from ..rag.chain import answer_question
from .knowledge_bases import get_kb_or_403

router = APIRouter(prefix="/api/kb", tags=["chat"])


@router.post("/{kb_id}/chat", response_model=schemas.ChatResponse)
def chat(
    kb_id: int,
    payload: schemas.ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    kb = get_kb_or_403(kb_id, db, current_user)
    if kb.chunk_count == 0:
        raise HTTPException(status_code=400, detail="知识库尚无可检索内容，请先上传文档")

    try:
        return answer_question(db, kb, payload.question, payload.top_k)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"问答失败: {e}") from e
