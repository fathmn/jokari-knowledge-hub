from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://jokari:jokari_secret@localhost:5432/knowledge_hub"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "jokari_minio"
    minio_secret_key: str = "jokari_minio_secret"
    minio_bucket: str = "documents"
    minio_secure: bool = False

    # LLM
    anthropic_api_key: str = ""
    llm_provider: str = "stub"  # stub | claude

    # App
    debug: bool = True
    secret_key: str = "dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
