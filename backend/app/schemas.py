"""Pydantic 入参 / 出参 schema。"""
from datetime import datetime

from pydantic import BaseModel, Field


# ---------- Provider ----------
class ProviderConfigField(BaseModel):
    key: str
    label: str
    value: str | None = None
    required: bool = True


class ProviderInfo(BaseModel):
    name: str
    label: str
    available: bool  # 依赖是否安装
    configured: bool  # 必填项是否齐全
    is_current: bool
    config_fields: list[ProviderConfigField]


# ---------- KnowledgeBase ----------
class KBCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str = ""
    visibility: str = "private"
    embedding_model: str | None = None
    chunk_size: int = 500
    chunk_overlap: int = 50


class KBOut(BaseModel):
    id: int
    name: str
    description: str
    visibility: str
    provider: str
    embedding_model: str
    chunk_size: int
    chunk_overlap: int
    doc_count: int
    chunk_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Document ----------
class DocumentOut(BaseModel):
    id: int
    kb_id: int
    filename: str
    file_type: str
    file_size: int
    chunk_count: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------- Chat ----------
class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1)
    top_k: int | None = None


class ChatSource(BaseModel):
    document: str
    content: str
    score: float


class ChatResponse(BaseModel):
    answer: str
    sources: list[ChatSource]
