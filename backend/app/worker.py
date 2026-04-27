import argparse
import socket
from uuid import UUID

from app.database import SessionLocal
from app.models.job import Job, JobType
from app.schemas.external_ingestion import WebsiteImportRequest
from app.services.external_ingestion import WebsiteCrawlerImportService
from app.services.ingestion import IngestionService
from app.services.jobs import JobService


def process_job(job: Job, worker_id: str) -> None:
    db = SessionLocal()
    jobs = JobService(db)
    try:
        running = jobs.mark_running(job.id, worker_id)
        result = _run_job(db, running)
        jobs.mark_succeeded(running.id, result)
    except Exception as exc:
        db.rollback()
        JobService(db).mark_failed(job.id, str(exc), retryable=True)
        raise
    finally:
        db.close()


def run_once(worker_id: str, job_types: list[JobType] | None = None) -> bool:
    db = SessionLocal()
    try:
        job = JobService(db).next_queued(job_types)
        if not job:
            return False
        job_id = job.id
    finally:
        db.close()

    process_job(Job(id=job_id), worker_id)
    return True


def _run_job(db, job: Job) -> dict:
    if job.job_type == JobType.DOCUMENT_INGESTION:
        document_id = UUID(job.payload_json["document_id"])
        IngestionService(db).process_document(document_id)
        return {"document_id": str(document_id)}

    if job.job_type == JobType.WEBSITE_IMPORT:
        request = WebsiteImportRequest(**job.payload_json["request"])
        actor = job.payload_json.get("actor", "worker")
        response = WebsiteCrawlerImportService(db).import_public_pages(request, actor=actor)
        return response.model_dump(mode="json")

    raise ValueError(f"Job-Typ wird noch nicht vom Worker unterstuetzt: {job.job_type}")


def parse_job_types(raw_values: list[str] | None) -> list[JobType] | None:
    if not raw_values:
        return None
    return [JobType(value) for value in raw_values]


def main() -> None:
    parser = argparse.ArgumentParser(description="Jokari Knowledge Hub worker")
    parser.add_argument("--once", action="store_true", help="Process at most one queued job")
    parser.add_argument("--worker-id", default=socket.gethostname())
    parser.add_argument("--job-type", action="append", choices=[item.value for item in JobType])
    args = parser.parse_args()

    job_types = parse_job_types(args.job_type)
    processed = run_once(args.worker_id, job_types)
    if args.once:
        print("processed=1" if processed else "processed=0")
        return

    while run_once(args.worker_id, job_types):
        print("processed=1")


if __name__ == "__main__":
    main()
