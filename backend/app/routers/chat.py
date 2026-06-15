"""RAG 问答路由。"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import schemas
from ..database import get_db
from ..models import KnowledgeBase
from ..rag.chain import answer_question

router = APIRouter(prefix="/api/kb", tags=["chat"])


@router.post("/{kb_id}/chat", response_model=schemas.ChatResponse)
def chat(kb_id: int, payload: schemas.ChatRequest, db: Session = Depends(get_db)) -> dict:
    kb = db.get(KnowledgeBase, kb_id)
    if kb is None:
        raise HTTPException(status_code=404, detail="知识库不存在")
    if kb.chunk_count == 0:
        raise HTTPException(status_code=400, detail="知识库尚无可检索内容，请先上传文档")

    try:
        return answer_question(db, kb, payload.question, payload.top_k)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"问答失败: {e}") from e
