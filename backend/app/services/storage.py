import os
import uuid
from datetime import timedelta
from functools import lru_cache
from minio import Minio
from minio.error import S3Error
from app.config import get_settings


class StorageService:
    """Service for file storage using MinIO."""

    def __init__(self):
        settings = get_settings()
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure
        )
        self.bucket = settings.minio_bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Create bucket if it doesn't exist."""
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error as e:
            print(f"Fehler beim Erstellen des Buckets: {e}")

    def upload_file(self, file_content: bytes, filename: str, content_type: str = None) -> str:
        """
        Upload a file to storage.

        Returns:
            str: The storage path (object name)
        """
        # Generate unique path
        file_id = str(uuid.uuid4())
        ext = os.path.splitext(filename)[1]
        object_name = f"documents/{file_id}{ext}"

        # Upload to MinIO
        from io import BytesIO
        file_stream = BytesIO(file_content)

        self.client.put_object(
            self.bucket,
            object_name,
            file_stream,
            length=len(file_content),
            content_type=content_type or "application/octet-stream"
        )

        return object_name

    def download_file(self, object_name: str) -> bytes:
        """Download a file from storage."""
        try:
            response = self.client.get_object(self.bucket, object_name)
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_file_url(self, object_name: str, expires: timedelta = timedelta(hours=1)) -> str:
        """Get a presigned URL for file access."""
        return self.client.presigned_get_object(
            self.bucket,
            object_name,
            expires=expires
        )

    def delete_file(self, object_name: str):
        """Delete a file from storage."""
        self.client.remove_object(self.bucket, object_name)

    def download_to_temp(self, object_name: str) -> str:
        """Download file to a temporary location and return path."""
        import tempfile
        ext = os.path.splitext(object_name)[1]

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = self.download_file(object_name)
            tmp.write(content)
            return tmp.name


@lru_cache()
def get_storage_service() -> StorageService:
    return StorageService()
