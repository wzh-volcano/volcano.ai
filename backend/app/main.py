"""FastAPI 应用入口。

启动：在 backend/ 目录下执行
    uvicorn app.main:app --reload --port 8000
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .routers import chat, documents, knowledge_bases, providers


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：建库建表
    init_db()
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
app.include_router(knowledge_bases.router)
app.include_router(documents.router)
app.include_router(chat.router)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "service": "rag-backend"}
