from app.schemas.document import (
    DocumentCreate,
    DocumentResponse,
    DocumentListResponse,
    DocumentStatusResponse
)
from app.schemas.record import (
    RecordResponse,
    RecordListResponse,
    RecordUpdate
)
from app.schemas.review import (
    ReviewAction,
    ProposedUpdateResponse
)
from app.schemas.search import (
    SearchQuery,
    SearchResult,
    SearchResponse
)
from app.schemas.dashboard import DashboardStats

__all__ = [
    "DocumentCreate",
    "DocumentResponse",
    "DocumentListResponse",
    "DocumentStatusResponse",
    "RecordResponse",
    "RecordListResponse",
    "RecordUpdate",
    "ReviewAction",
    "ProposedUpdateResponse",
    "SearchQuery",
    "SearchResult",
    "SearchResponse",
    "DashboardStats"
]
