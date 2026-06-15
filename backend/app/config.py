"""应用配置：从 .env 读取，带默认值。"""
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Provider
    llm_provider: str = "zhipu"
    llm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"
    llm_api_key: str = ""
    llm_model: str = "glm-4"
    embedding_model: str = "embedding-3"

    # Server
    app_host: str = "127.0.0.1"
    app_port: int = 8000

    # Storage
    sqlite_path: str = "data/rag.db"
    upload_dir: str = "data/uploads"

    # Upload
    max_file_size_mb: int = 20

    # RAG defaults
    default_chunk_size: int = 500
    default_chunk_overlap: int = 50
    default_top_k: int = 4

    # Auth
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24h
    init_admin_username: str = "admin"
    init_admin_password: str = "admin123"

    @property
    def sqlite_url(self) -> str:
        return f"sqlite:///{self.sqlite_path}"

    @property
    def upload_path(self) -> Path:
        p = Path(self.upload_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def max_file_size_bytes(self) -> int:
        return self.max_file_size_mb * 1024 * 1024

    def ensure_dirs(self) -> None:
        """确保 SQLite 父目录与上传目录存在。"""
        Path(self.sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        self.upload_path


settings = Settings()
