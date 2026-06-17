"""SQLAlchemy 引擎、会话与建表。"""
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

engine = create_engine(
    settings.sqlite_url,
    connect_args={"check_same_thread": False},  # SQLite + FastAPI 多线程
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """所有 ORM 模型的基类。"""


def init_db() -> None:
    """创建所有表（幂等）。对已有数据库执行 ALTER TABLE 补齐新列。"""
    # 确保导入模型以触发注册
    from . import models  # noqa: F401

    settings.ensure_dirs()
    Base.metadata.create_all(bind=engine)
    _migrate_add_columns()


def _migrate_add_columns() -> None:
    """对已有的 SQLite 数据库补充新增列（如果缺少的话）。"""
    import sqlite3

    db_path = settings.sqlite_url.split(":///")[-1]
    if not db_path:
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # knowledge_bases 新增 chunk_method 列
    _ensure_column(cursor, "knowledge_bases", "chunk_method", "VARCHAR(20) DEFAULT 'general_auto'")
    # knowledge_bases 新增 extra_json 列
    _ensure_column(cursor, "knowledge_bases", "extra_json", "TEXT DEFAULT '{}'")

    # chunks 新增 parent_chunk_id 列
    _ensure_column(cursor, "chunks", "parent_chunk_id", "INTEGER REFERENCES chunks(id)")
    # chunks 新增 parent_content 列
    _ensure_column(cursor, "chunks", "parent_content", "TEXT")

    # provider_configs 新增 is_embedding_active 列（独立的 embedding 激活标记）
    _ensure_column(
        cursor, "provider_configs", "is_embedding_active", "BOOLEAN DEFAULT 0"
    )

    # documents 新增 file_path 列（用于再次分片时找回原文件）
    _ensure_column(cursor, "documents", "file_path", "VARCHAR(512) DEFAULT ''")
    # documents 新增 enabled 列（是否参与 RAG 检索）
    _ensure_column(cursor, "documents", "enabled", "BOOLEAN DEFAULT 1")

    # skills 新增 description 列
    _ensure_column(cursor, "skills", "description", "VARCHAR(512) DEFAULT ''")

    # apps 新增 api_enabled 列
    _ensure_column(cursor, "apps", "api_enabled", "BOOLEAN DEFAULT 0")

    # plugin_extensions 表
    _ensure_table(cursor, "plugin_extensions", """
        CREATE TABLE IF NOT EXISTS plugin_extensions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT 'extension',
            source TEXT NOT NULL DEFAULT 'uploaded',
            version TEXT NOT NULL DEFAULT '',
            skills_json TEXT NOT NULL DEFAULT '{}',
            hooks_json TEXT NOT NULL DEFAULT '{}',
            frontend_json TEXT NOT NULL DEFAULT '{}',
            installed BOOLEAN NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT 0,
            error TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    conn.commit()
    conn.close()


def _ensure_column(cursor, table: str, column: str, col_type: str) -> None:
    """如果 table 中不存在 column 则执行 ALTER TABLE ADD COLUMN。"""
    cursor.execute(f"PRAGMA table_info({table})")
    columns = {row[1] for row in cursor.fetchall()}
    if column not in columns:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")


def _ensure_table(cursor, table: str, create_sql: str) -> None:
    """Create table if it doesn't exist."""
    cursor.execute(
        f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'"
    )
    if not cursor.fetchone():
        cursor.execute(create_sql)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：每请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
