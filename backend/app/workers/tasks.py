from uuid import UUID
from app.workers.celery_app import celery_app
from app.database import SessionLocal
from app.services.ingestion import IngestionService


@celery_app.task(bind=True, max_retries=3)
def process_document_task(self, document_id: str):
    """
    Celery task to process a document through the ingestion pipeline.

    Args:
        document_id: UUID string of the document to process
    """
    db = SessionLocal()
    try:
        service = IngestionService(db)
        service.process_document(UUID(document_id))
        return {"status": "success", "document_id": document_id}
    except Exception as e:
        # Retry on failure
        try:
            self.retry(exc=e, countdown=60)  # Retry after 60 seconds
        except self.MaxRetriesExceededError:
            return {"status": "failed", "document_id": document_id, "error": str(e)}
    finally:
        db.close()
