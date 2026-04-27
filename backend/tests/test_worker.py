from app.models.job import JobStatus, JobType
from app.services.jobs import JobService
from app.worker import parse_job_types


def test_next_queued_returns_oldest_matching_job(db_session):
    service = JobService(db_session)
    first = service.enqueue(JobType.WEBSITE_IMPORT, {"request": {"urls": ["https://jokari.de"]}})
    service.enqueue(JobType.DOCUMENT_INGESTION, {"document_id": "00000000-0000-0000-0000-000000000000"})

    next_job = service.next_queued([JobType.WEBSITE_IMPORT])

    assert next_job.id == first.id
    assert next_job.status == JobStatus.QUEUED


def test_parse_job_types_maps_cli_values():
    assert parse_job_types(["website_import"]) == [JobType.WEBSITE_IMPORT]
