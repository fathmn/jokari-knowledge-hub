from fastapi import APIRouter, Depends
from app.api import upload, documents, review, search, dashboard, external_ingestion
from app.auth import get_current_user, require_reviewer

api_router = APIRouter()

api_router.include_router(
    upload.router,
    prefix="/upload",
    tags=["Upload"],
    dependencies=[Depends(require_reviewer)],
)
api_router.include_router(
    documents.router,
    prefix="/documents",
    tags=["Dokumente"],
    dependencies=[Depends(get_current_user)],
)
api_router.include_router(
    review.router,
    prefix="/review",
    tags=["Review"],
    dependencies=[Depends(require_reviewer)],
)
api_router.include_router(
    search.router,
    prefix="/knowledge",
    tags=["Suche"],
    dependencies=[Depends(get_current_user)],
)
api_router.include_router(
    dashboard.router,
    prefix="/dashboard",
    tags=["Dashboard"],
    dependencies=[Depends(get_current_user)],
)
api_router.include_router(
    external_ingestion.router,
    prefix="/ingest",
    tags=["External Ingestion"],
)
