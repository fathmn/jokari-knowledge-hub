from app.extractors.base import LLMExtractor
from app.extractors.stub import LocalStubExtractor
from app.extractors.claude import ClaudeExtractor
from app.config import get_settings


def get_extractor() -> LLMExtractor:
    """Get the configured LLM extractor."""
    settings = get_settings()

    if settings.llm_provider == "claude":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY nicht konfiguriert")
        return ClaudeExtractor()
    else:
        return LocalStubExtractor()
