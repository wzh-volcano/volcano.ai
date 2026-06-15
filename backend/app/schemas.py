"""Pydantic 入参 / 出参 schema。"""
from datetime import datetime

from pydantic import BaseModel, Field


# ---------- Provider ----------
class ProviderConfigField(BaseModel):
    key: str
    label: str
    value: str | None = None
    required: bool = True
    type: str = "text"  # text | password


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
    owner_id: int
    owner_username: str | None = None
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


# ---------- Auth / User ----------
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = Field("user", pattern="^(admin|user)$")


class UserUpdate(BaseModel):
    role: str | None = Field(None, pattern="^(admin|user)$")
    status: str | None = Field(None, pattern="^(active|disabled)$")


class UserOut(BaseModel):
    id: int
    username: str
    role: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ResetPasswordOut(BaseModel):
    new_password: str


# ---------- Plugin (Provider Configs) ----------
class PluginOut(BaseModel):
    """provider_configs 表的对外视图。"""

    id: int
    name: str
    label: str
    category: str  # model | other
    source: str  # builtin | uploaded
    module_path: str
    installed: bool
    is_active: bool
    base_url: str
    api_key_set: bool  # 不暴露 api_key 明文
    llm_model: str
    embedding_model: str
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class PluginUpdate(BaseModel):
    """更新插件配置。"""

    label: str | None = None
    category: str | None = Field(None, pattern="^(model|other)$")
    base_url: str | None = None
    api_key: str | None = None  # 留空表示不修改
    llm_model: str | None = None
    embedding_model: str | None = None
    extra_json: str | None = None


class PluginInstallResponse(BaseModel):
    """上传 / 导入 / 安装结果。"""

    name: str
    installed: bool
    error: str | None = None


class PluginImportRequest(BaseModel):
    """通过 URL 导入插件。"""

    url: str = Field(..., min_length=1, max_length=2048)
