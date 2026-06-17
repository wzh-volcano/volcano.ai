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
    chunk_method: str = "general_auto"
    chunk_size: int = 500
    chunk_overlap: int = 50
    # general_custom 时可传入自定义分隔符
    separators: list[str] | None = None
    # parent_child 时可传入父块大小
    parent_chunk_size: int | None = None


class KBOut(BaseModel):
    id: int
    name: str
    description: str
    visibility: str
    provider: str
    embedding_model: str
    chunk_method: str
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
    enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TextDocumentRequest(BaseModel):
    """直接粘贴文本内容创建文档（支持 Markdown / 纯文本）。"""
    title: str = Field(..., min_length=1, max_length=256)
    content: str = Field(..., min_length=1)
    file_type: str = "md"  # md | txt


# ---------- Reindex ----------
class ReindexBatchRequest(BaseModel):
    """批量再次分片入参。"""
    doc_ids: list[int] = Field(..., min_length=1)


class ReindexBatchItemResult(BaseModel):
    doc_id: int
    status: str  # ready | error
    error: str | None = None


class ReindexBatchResponse(BaseModel):
    results: list[ReindexBatchItemResult]


# ---------- Toggle Enabled ----------
class ToggleEnabledRequest(BaseModel):
    """批量启用 / 禁用文档。"""
    doc_ids: list[int] = Field(..., min_length=1)
    enabled: bool


# ---------- Chunk ----------
class ChunkOut(BaseModel):
    id: int
    doc_id: int
    kb_id: int
    content: str
    token_count: int
    parent_chunk_id: int | None = None
    parent_content: str | None = None
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


class ChunkUpdate(BaseModel):
    content: str = Field(..., min_length=1)


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


# ---------- API Keys ----------
class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)


class ApiKeyOut(BaseModel):
    id: int
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None
    call_count: int

    class Config:
        from_attributes = True


class ApiKeyCreatedOut(ApiKeyOut):
    """创建成功后返回一次完整 key。"""
    full_key: str


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
    is_embedding_active: bool
    base_url: str
    api_key_set: bool  # 不暴露 api_key 明文
    embedding_model: str
    extra_json: str | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime


class PluginUpdate(BaseModel):
    """更新插件配置。"""

    label: str | None = None
    category: str | None = Field(None, pattern="^(model|other)$")
    base_url: str | None = None
    api_key: str | None = None  # 留空表示不修改
    embedding_model: str | None = None
    is_active: bool | None = None
    is_embedding_active: bool | None = None
    extra_json: str | None = None


class PluginInstallResponse(BaseModel):
    """上传 / 导入 / 安装结果。"""

    name: str
    installed: bool
    error: str | None = None


class ExtensionPluginOut(BaseModel):
    id: int
    name: str
    label: str
    category: str
    source: str
    version: str
    skills_json: str | None = None
    hooks_json: str | None = None
    frontend_json: str | None = None
    installed: bool
    is_active: bool
    error: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExtensionPluginSkillUpdate(BaseModel):
    """Update skill keywords / match mode."""
    name: str
    keywords: list[str]
    match_mode: str = "keyword"


class PluginImportRequest(BaseModel):
    """通过 URL 导入插件。"""

    url: str = Field(..., min_length=1, max_length=2048)


class PluginModelsRequest(BaseModel):
    """拉取可用模型列表：表单当前值优先，留空则回退到已保存配置。

    允许管理员在保存前就用刚填好的 base_url/api_key 试拉。
    """

    base_url: str | None = None
    api_key: str | None = None  # 留空表示用 DB 里已存的 key


class PluginModelsResponse(BaseModel):
    """可用模型 ID 列表。"""

    models: list[str]


class ModelInfo(BaseModel):
    name: str
    context: int = 4096

class ActiveModelOut(BaseModel):
    provider_name: str
    label: str
    models: list[ModelInfo]



# ---------- App ----------
class AppCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    icon: str = "\U0001f916"
    description: str = ""


class AppUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=128)
    icon: str | None = None
    description: str | None = None
    config_json: str | None = None
    api_enabled: bool | None = None


class AppStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(draft|published)$")


class AppOut(BaseModel):
    id: int
    name: str
    icon: str
    description: str
    type: str
    category: str
    status: str
    api_enabled: bool = False
    config_json: str
    owner_id: int
    owner_username: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessage(BaseModel):
    role: str
    content: str

class AppChatRequest(BaseModel):
    question: str = ""
    stream: bool = False
    messages: list[ChatMessage] | None = None

class AppSimpleChatRequest(BaseModel):
    question: str = Field(..., min_length=1)

class AppCompressRequest(BaseModel):
    messages: list[ChatMessage]


# ---------- Conversation ----------
class ConversationCreate(BaseModel):
    title: str = ""


class ConversationUpdate(BaseModel):
    title: str | None = None
    summary: str | None = None


class ConversationOut(BaseModel):
    id: int
    app_id: int
    title: str
    summary: str | None = None
    message_count: int
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    role: str
    content: str
    token_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreate(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1)


class MessagesBatchCreate(BaseModel):
    messages: list[MessageCreate] = Field(..., min_length=1)
