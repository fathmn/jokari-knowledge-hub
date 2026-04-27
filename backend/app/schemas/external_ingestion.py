from pydantic import BaseModel, Field, HttpUrl, model_validator
from typing import Any, Optional
from uuid import UUID

from app.models.document import Department, DocType
from app.models.external_import import ExternalSourceType, ExternalTrustType
from app.models.record import RecordStatus


class ModelPricing(BaseModel):
    model: str = "gpt-5.4-mini"
    input_per_million: float = Field(default=0.75, ge=0)
    output_per_million: float = Field(default=4.50, ge=0)
    verified_on: str = "2026-04-27"
    source_url: str = "https://developers.openai.com/api/docs/pricing"


class TokenEstimateItem(BaseModel):
    source_type: ExternalSourceType
    source_id: str
    sample_text: Optional[str] = None
    average_chars: Optional[int] = Field(default=None, ge=0)
    record_count: int = Field(default=1, ge=1)
    expected_output_tokens_per_record: int = Field(default=700, ge=0)

    @model_validator(mode="after")
    def require_text_or_average_chars(self):
        if not self.sample_text and self.average_chars is None:
            raise ValueError("sample_text oder average_chars ist erforderlich")
        return self


class TokenEstimateRequest(BaseModel):
    items: list[TokenEstimateItem]
    pricing: ModelPricing = Field(default_factory=ModelPricing)


class TokenEstimateResponse(BaseModel):
    model: str
    input_tokens: int
    output_tokens: int
    estimated_input_cost_usd: float
    estimated_output_cost_usd: float
    estimated_total_cost_usd: float
    pricing_verified_on: str
    pricing_source_url: str


class ExternalImportRequest(BaseModel):
    source_type: ExternalSourceType
    source_id: str = Field(..., min_length=1, max_length=500)
    source_url: Optional[HttpUrl] = None
    api_endpoint: Optional[str] = Field(default=None, max_length=1000)
    source_version: Optional[str] = Field(default=None, max_length=255)
    content_hash: Optional[str] = Field(default=None, min_length=64, max_length=64)
    trust_type: ExternalTrustType = ExternalTrustType.UNAUTHENTICATED_PUBLIC
    authenticated_source: bool = False
    department: Department
    doc_type: DocType
    schema_type: Optional[str] = None
    data_json: dict[str, Any]
    evidence_excerpt: Optional[str] = None


class ExternalImportResponse(BaseModel):
    import_id: UUID
    record_id: Optional[UUID] = None
    status: str
    record_status: Optional[RecordStatus] = None
    auto_approved: bool
    duplicate: bool = False
    content_hash: str
    message: str
    record_action: Optional[str] = None


class SitemapUrlSummary(BaseModel):
    total_entries: int
    unique_urls: int
    duplicates: int
    by_source_type: dict[str, int]


class SitemapPlanRequest(BaseModel):
    sitemap_xml: str
    pricing: ModelPricing = Field(default_factory=ModelPricing)


class SitemapPlanResponse(BaseModel):
    summary: SitemapUrlSummary
    estimate: TokenEstimateResponse


class WebsiteImportRequest(BaseModel):
    urls: list[HttpUrl] = Field(default_factory=list)
    sitemap_xml: Optional[str] = None
    source_type: ExternalSourceType = ExternalSourceType.CRAWLEE
    include_images: bool = True
    max_images_per_page: int = Field(default=8, ge=0, le=8)
    max_pages: int = Field(default=50, ge=1, le=50)

    @model_validator(mode="after")
    def require_urls_or_sitemap(self):
        if not self.urls and not self.sitemap_xml:
            raise ValueError("urls oder sitemap_xml ist erforderlich")
        crawler_source_types = {
            ExternalSourceType.SITEMAP,
            ExternalSourceType.CLOUDFLARE_API,
            ExternalSourceType.CLOUDFLARE_MCP,
            ExternalSourceType.FIRECRAWL,
            ExternalSourceType.CRAWLEE,
            ExternalSourceType.BROWSER_MCP,
        }
        if self.source_type not in crawler_source_types:
            raise ValueError("website imports erlauben nur crawler-basierte source_type Werte")
        return self


class WebsiteImportPageResult(BaseModel):
    url: str
    status: str
    record_id: Optional[UUID] = None
    record_status: Optional[RecordStatus] = None
    schema_type: Optional[str] = None
    images_found: int = 0
    images_attached: int = 0
    error: Optional[str] = None


class WebsiteImportResponse(BaseModel):
    total_urls: int
    imported: int
    needs_review: int
    auto_approved: int
    duplicates: int
    failed: int
    images_attached: int
    results: list[WebsiteImportPageResult]
