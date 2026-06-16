"""FastAPI 应用入口。

启动：在 backend/ 目录下执行
    uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .config import settings
from .database import SessionLocal, init_db
from .models import User
from .providers import (
    load_uploaded_plugins,
    sync_builtin_to_db,
    sync_uploaded_to_db,
)
from .routers import (
    apps,
    auth,
    chat,
    documents,
    knowledge_bases,
    plugins,
    providers,
    skills,
    users,
)
from .security import hash_password


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
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：建库建表 + 初始化管理员 + 同步插件
    init_db()
    seed_admin()
    seed_providers()
    yield


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
app.include_router(skills.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "rag-backend"}
