from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://jokari:jokari_secret@localhost:5432/knowledge_hub"

    # Supabase Storage
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket: str = "documents"

    # LLM
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    llm_provider: str = "stub"  # stub | claude
    llm_timeout_seconds: float = 120.0

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,https://jokari-knowledge-hub.vercel.app"

    # App
    debug: bool = False
    secret_key: str = "dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
