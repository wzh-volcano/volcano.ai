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
    """创建所有表（幂等）。"""
    # 确保导入模型以触发注册
    from . import models  # noqa: F401

    settings.ensure_dirs()
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依赖：每请求一个会话。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
