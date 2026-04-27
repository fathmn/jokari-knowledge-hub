from dataclasses import dataclass
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.auth import require_reviewer
from app.schemas.external_ingestion import (
    ExternalImportRequest,
    ExternalImportResponse,
    SitemapPlanRequest,
    SitemapPlanResponse,
    TokenEstimateRequest,
    TokenEstimateResponse,
    WebsiteImportRequest,
    WebsiteImportResponse,
)
from app.services.external_ingestion import (
    ExternalKnowledgeImportService,
    SitemapPlanningService,
    TokenCostEstimator,
    WebsiteCrawlerImportService,
)

router = APIRouter()


@dataclass(frozen=True)
class IngestionSourceIdentity:
    actor: str
    is_pim_trusted: bool


def require_trusted_ingestion_source(
    x_ingestion_api_key: str | None = Header(default=None),
) -> IngestionSourceIdentity:
    settings = get_settings()
    allowed_keys = settings.trusted_ingestion_api_keys_list
    if not allowed_keys:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Trusted ingestion API keys are not configured",
        )
    for configured_key in allowed_keys:
        actor, secret = _parse_configured_ingestion_key(configured_key)
        if x_ingestion_api_key and secrets.compare_digest(x_ingestion_api_key, secret):
            return IngestionSourceIdentity(
                actor=actor,
                is_pim_trusted=actor in settings.trusted_pim_ingestion_sources_list,
            )
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid ingestion source credentials",
    )


def _parse_configured_ingestion_key(configured_key: str) -> tuple[str, str]:
    if ":" not in configured_key:
        return "trusted-ingestion-source", configured_key
    actor, secret = configured_key.split(":", 1)
    actor = actor.strip() or "trusted-ingestion-source"
    secret = secret.strip()
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Invalid trusted ingestion API key configuration",
        )
    return actor, secret


@router.post("/estimate", response_model=TokenEstimateResponse, dependencies=[Depends(require_reviewer)])
async def estimate_external_ingestion(
    request: TokenEstimateRequest,
):
    """Estimate extraction cost before importing sitemap, Cloudflare, PIM, or manual data."""
    return TokenCostEstimator().estimate(request)


@router.post("/sitemap/plan", response_model=SitemapPlanResponse, dependencies=[Depends(require_reviewer)])
async def plan_sitemap_ingestion(
    request: SitemapPlanRequest,
):
    """Summarize sitemap URLs and estimate extraction cost without crawling the pages."""
    plan = SitemapPlanningService().plan(request.sitemap_xml, request.pricing)
    return SitemapPlanResponse(summary=plan.summary, estimate=plan.estimate)


@router.post("/external", response_model=ExternalImportResponse)
async def import_external_record(
    request: ExternalImportRequest,
    db: Session = Depends(get_db),
    source_identity: IngestionSourceIdentity = Depends(require_trusted_ingestion_source),
):
    """Import one structured external record with provenance and guarded auto-approval."""
    return ExternalKnowledgeImportService(db).import_record(
        request,
        actor=source_identity.actor,
        actor_is_pim_trusted=source_identity.is_pim_trusted,
    )


@router.post("/website/import", response_model=WebsiteImportResponse)
async def import_website_pages(
    request: WebsiteImportRequest,
    db: Session = Depends(get_db),
    source_identity: IngestionSourceIdentity = Depends(require_trusted_ingestion_source),
):
    """Fetch public website pages and import normalized records into the review flow."""
    return WebsiteCrawlerImportService(db).import_public_pages(
        request,
        actor=source_identity.actor,
    )
