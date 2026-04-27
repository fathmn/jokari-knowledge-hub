from app.models.job import Job, JobStatus, JobType
from app.services.jobs import JobService


def test_enqueue_job_is_idempotent_by_key(db_session):
    service = JobService(db_session)

    first = service.enqueue(
        JobType.DOCUMENT_INGESTION,
        {"document_id": "doc-1"},
        idempotency_key="document:doc-1",
    )
    second = service.enqueue(
        JobType.DOCUMENT_INGESTION,
        {"document_id": "doc-1"},
        idempotency_key="document:doc-1",
    )

    assert second.id == first.id
    assert db_session.query(Job).count() == 1


def test_job_lifecycle_records_running_success_and_failure(db_session):
    service = JobService(db_session)
    job = service.enqueue(JobType.WEBSITE_IMPORT, {"urls": ["https://jokari.de"]})

    running = service.mark_running(job.id, worker_id="worker-1")
    assert running.status == JobStatus.RUNNING
    assert running.attempts == 1
    assert running.locked_by == "worker-1"
    assert running.started_at is not None

    succeeded = service.mark_succeeded(job.id, {"imported": 1})
    assert succeeded.status == JobStatus.SUCCEEDED
    assert succeeded.result_json == {"imported": 1}
    assert succeeded.locked_by is None
    assert succeeded.finished_at is not None


def test_retryable_failure_requeues_until_max_attempts(db_session):
    service = JobService(db_session)
    job = service.enqueue(JobType.LLM_EXTRACTION, {"document_id": "doc-1"}, max_attempts=1)
    service.mark_running(job.id, worker_id="worker-1")

    failed = service.mark_failed(job.id, "Claude timeout", retryable=True)

    assert failed.status == JobStatus.FAILED
    assert failed.error_message == "Claude timeout"
    assert failed.finished_at is not None
