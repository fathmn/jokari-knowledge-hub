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
    llm_extraction_concurrency: int = 3
    claude_multi_record_confidence: float = 0.85
    claude_partial_record_confidence: float = 0.5
    claude_single_record_confidence: float = 0.9
    claude_failure_confidence: float = 0.0
    stub_multi_record_confidence: float = 0.7
    stub_empty_result_confidence: float = 0.3
    stub_record_valid_confidence: float = 0.6
    stub_record_invalid_confidence: float = 0.4
    stub_single_valid_confidence: float = 0.6
    stub_single_invalid_confidence: float = 0.3

    # Parsing and chunking
    docx_fallback_confidence: float = 0.7
    pdf_parser_confidence: float = 0.7
    extraction_grouping_min_chunks: int = 12
    record_confidence_needs_review_threshold: float = 0.5
    sales_doc_type_mismatch_section_threshold: int = 3
    sales_doc_type_mismatch_filename_markers: str = "vertriebsschulung,schulung,training"
    stale_processing_minutes: int = 20

    # Upload
    allowed_upload_extensions: str = ".docx,.md,.markdown,.csv,.xlsx,.xls,.pdf"

    # Trusted external ingestion
    trusted_ingestion_api_keys: str = ""
    trusted_pim_ingestion_sources: str = ""
    website_import_allowed_hosts: str = "jokari.de,www.jokari.de,jostudy.de,www.jostudy.de"
    website_import_max_pages: int = 50
    website_import_max_images_per_page: int = 8
    website_import_http_timeout_seconds: float = 10.0

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://127.0.0.1:3000,https://jokari-knowledge-hub.vercel.app"

    # App
    debug: bool = False
    secret_key: str = "dev-secret-key-change-in-production"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def allowed_upload_extensions_list(self) -> list[str]:
        return [
            extension.strip().lower()
            for extension in self.allowed_upload_extensions.split(",")
            if extension.strip()
        ]

    @property
    def sales_doc_type_mismatch_filename_markers_list(self) -> list[str]:
        return [
            marker.strip().lower()
            for marker in self.sales_doc_type_mismatch_filename_markers.split(",")
            if marker.strip()
        ]

    @property
    def trusted_ingestion_api_keys_list(self) -> list[str]:
        return [
            key.strip()
            for key in self.trusted_ingestion_api_keys.split(",")
            if key.strip()
        ]

    @property
    def trusted_pim_ingestion_sources_list(self) -> list[str]:
        return [
            source.strip()
            for source in self.trusted_pim_ingestion_sources.split(",")
            if source.strip()
        ]

    @property
    def website_import_allowed_hosts_list(self) -> list[str]:
        return [
            host.strip().lower()
            for host in self.website_import_allowed_hosts.split(",")
            if host.strip()
        ]


@lru_cache()
def get_settings() -> Settings:
    return Settings()
