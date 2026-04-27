from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.job import Job, JobStatus, JobType


class JobService:
    """Small durable job registry used to move long-running work out of web requests."""

    def __init__(self, db: Session):
        self.db = db

    def enqueue(
        self,
        job_type: JobType,
        payload: dict[str, Any],
        idempotency_key: str | None = None,
        max_attempts: int = 3,
    ) -> Job:
        if idempotency_key:
            existing = self.db.query(Job).filter(Job.idempotency_key == idempotency_key).first()
            if existing:
                return existing

        job = Job(
            job_type=job_type,
            payload_json=payload,
            idempotency_key=idempotency_key,
            max_attempts=max_attempts,
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_running(self, job_id: UUID, worker_id: str) -> Job:
        job = self._get_job(job_id)
        job.status = JobStatus.RUNNING
        job.locked_by = worker_id
        job.locked_at = datetime.utcnow()
        job.started_at = job.started_at or datetime.utcnow()
        job.attempts += 1
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def next_queued(self, job_types: list[JobType] | None = None) -> Job | None:
        query = self.db.query(Job).filter(Job.status == JobStatus.QUEUED)
        if job_types:
            query = query.filter(Job.job_type.in_(job_types))
        return query.order_by(Job.created_at.asc()).first()

    def mark_succeeded(self, job_id: UUID, result: dict[str, Any] | None = None) -> Job:
        job = self._get_job(job_id)
        job.status = JobStatus.SUCCEEDED
        job.result_json = result or {}
        job.error_message = None
        job.finished_at = datetime.utcnow()
        job.locked_by = None
        job.locked_at = None
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def mark_failed(self, job_id: UUID, error_message: str, retryable: bool = True) -> Job:
        job = self._get_job(job_id)
        if retryable and job.attempts < job.max_attempts:
            job.status = JobStatus.QUEUED
            job.locked_by = None
            job.locked_at = None
        else:
            job.status = JobStatus.FAILED
            job.finished_at = datetime.utcnow()
        job.error_message = error_message[:2000]
        job.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(job)
        return job

    def _get_job(self, job_id: UUID) -> Job:
        job = self.db.query(Job).filter(Job.id == job_id).first()
        if not job:
            raise ValueError(f"Job nicht gefunden: {job_id}")
        return job
