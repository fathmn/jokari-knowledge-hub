import os
import uuid
from functools import lru_cache
from supabase import create_client, Client
from app.config import get_settings


class StorageService:
    """Service for file storage using Supabase Storage."""

    def __init__(self):
        settings = get_settings()
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
        self.bucket = settings.supabase_bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Create bucket if it doesn't exist."""
        try:
            # List existing buckets
            buckets = self.client.storage.list_buckets()
            bucket_names = [b.name for b in buckets]

            if self.bucket not in bucket_names:
                self.client.storage.create_bucket(
                    self.bucket,
                    options={"public": False}
                )
        except Exception as e:
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

        # Upload to Supabase Storage
        self.client.storage.from_(self.bucket).upload(
            path=object_name,
            file=file_content,
            file_options={"content-type": content_type or "application/octet-stream"}
        )

        return object_name

    def download_file(self, object_name: str) -> bytes:
        """Download a file from storage."""
        response = self.client.storage.from_(self.bucket).download(object_name)
        return response

    def get_file_url(self, object_name: str, expires_in: int = 3600) -> str:
        """Get a signed URL for file access (default 1 hour)."""
        response = self.client.storage.from_(self.bucket).create_signed_url(
            object_name,
            expires_in
        )
        return response.get("signedURL", "")

    def delete_file(self, object_name: str):
        """Delete a file from storage."""
        self.client.storage.from_(self.bucket).remove([object_name])

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
