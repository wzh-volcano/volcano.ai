"""FastAPI 应用入口。

启动：在 backend/ 目录下执行
    uvicorn app.main:app --reload --port 8000
"""
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .config import settings
from .database import SessionLocal, init_db
from .models import PluginExtension, User
from .mcp.client_manager import get_mcp_manager
from .providers import (
    load_uploaded_plugins,
    sync_builtin_to_db,
    sync_uploaded_to_db,
)
from .plugins.registry import register_builtin_providers, sync_extensions_to_db
from .routers import (
    apps,
    auth,
    chat,
    conversations,
    documents,
    knowledge_bases,
    plugins,
    plugins_v2,
    providers,
    public_api,
    users,
)
from .security import hash_password

logger = logging.getLogger(__name__)


def seed_admin() -> None:
    """首次启动时若 users 表为空，按配置创建初始管理员。"""
    db = SessionLocal()
    try:
        count = db.scalar(select(func.count(User.id)))
        if count:
            return
        admin = User(
            username=settings.init_admin_username,
            password_hash=hash_password(settings.init_admin_password),
            role="admin",
            status="active",
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


def seed_providers() -> None:
    """启动时同步内置 provider + 扫描已上传插件，保证 DB 一致。"""
    db = SessionLocal()
    try:
        sync_builtin_to_db(db)
        results = load_uploaded_plugins()
        sync_uploaded_to_db(db, results)
        register_builtin_providers()
        sync_extensions_to_db(db)
    finally:
        db.close()


# Built-in MCP tool definitions and handler
BUILTIN_TOOL_DEFS = [
    {
        "name": "knowledge_search",
        "description": "Search the knowledge base for relevant chunks. Call this when the user asks about specific documents or knowledge.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "kb_ids": {
                    "type": "array", "items": {"type": "integer"},
                    "description": "Optional knowledge base IDs to restrict search to",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "skill_get_guide",
        "description": "Get skill guide content matching the user query. Call this when a skill plugin might be relevant.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "User query to match against skill keywords"},
                "app_id": {"type": "integer", "description": "Optional app ID to filter skills"},
            },
            "required": ["query"],
        },
    },
]


async def _builtin_mcp_handler(tool_name: str, arguments: dict) -> str:
    """In-process handler for built-in MCP tools."""
    from .mcp.builtin_server import call_tool_directly
    return await call_tool_directly(tool_name, arguments)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：建库建表 + 初始化管理员 + 同步插件
    init_db()
    seed_admin()
    seed_providers()

    # ---- MCP Server initialization ----
    # Built-in MCP tools (in-process, no subprocess)
    try:
        mgr = get_mcp_manager()
        mgr.register_inproc_tools("mcp_builtin", BUILTIN_TOOL_DEFS, _builtin_mcp_handler)
        logger.info("Built-in MCP tools registered")
    except Exception as e:
        logger.error("Failed to register built-in MCP tools: %s", e)

    # User-activated MCP Server plugins
    db = SessionLocal()
    try:
        plugins = db.query(PluginExtension).filter(
            PluginExtension.category == "mcp_server",
            PluginExtension.is_active == True,
        ).all()
        for plugin in plugins:
            from .services.plugin_loader import plugins_root
            entry = str(plugins_root() / plugin.name / "server.py")
            if os.path.exists(entry):
                try:
                    await get_mcp_manager().start_plugin(plugin.name, entry)
                    logger.info("MCP plugin %s started", plugin.name)
                except Exception as e:
                    logger.error("Failed to start MCP plugin %s: %s", plugin.name, e)
            else:
                logger.warning("MCP plugin %s entry not found at %s", plugin.name, entry)
    finally:
        db.close()

    yield

    # ---- Shutdown: stop MCP ----
    await get_mcp_manager().stop_all()
    logger.info("All MCP servers stopped")


app = FastAPI(
    title="RAG 知识库后端",
    version="0.1.0",
    description="插件化 LLM/Embedding + SQLite 向量存储 + LangChain RAG",
    lifespan=lifespan,
)

# CORS（开发期宽松；线上应收紧来源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由
app.include_router(providers.router)
app.include_router(plugins.router)
app.include_router(knowledge_bases.router)
app.include_router(documents.router)
app.include_router(chat.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(apps.router)
app.include_router(conversations.router)
app.include_router(public_api.router)
app.include_router(plugins_v2.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "rag-backend"}
