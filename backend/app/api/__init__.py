from fastapi import APIRouter
from app.api import upload, documents, review, search, dashboard

api_router = APIRouter()

api_router.include_router(upload.router, prefix="/upload", tags=["Upload"])
api_router.include_router(documents.router, prefix="/documents", tags=["Dokumente"])
api_router.include_router(review.router, prefix="/review", tags=["Review"])
api_router.include_router(search.router, prefix="/knowledge", tags=["Suche"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
