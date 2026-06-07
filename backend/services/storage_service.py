import os
import shutil
from fastapi import UploadFile
from backend.config import settings

class StorageService:
    def __init__(self):
        # Determine if S3 parameters are provided
        self.use_s3 = bool(
            settings.AWS_ACCESS_KEY_ID and 
            settings.AWS_SECRET_ACCESS_KEY and 
            settings.S3_BUCKET_NAME
        )
        if self.use_s3:
            # We import boto3 dynamically so we don't crash if it's not installed/needed
            import boto3
            self.s3_client = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_REGION
            )
        else:
            os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    async def upload_file(self, file: UploadFile, project_id: str, document_id: str) -> tuple[str, str]:
        """
        Uploads file and returns (bucket, key_or_path).
        For local storage, bucket is "local" and key_or_path is the absolute/relative local path.
        """
        file_extension = os.path.splitext(file.filename)[1]
        unique_filename = f"{project_id}/{document_id}{file_extension}"
        
        if self.use_s3:
            # Reset pointer
            await file.seek(0)
            self.s3_client.upload_fileobj(
                file.file,
                settings.S3_BUCKET_NAME,
                unique_filename,
                ExtraArgs={"ContentType": file.content_type}
            )
            return settings.S3_BUCKET_NAME, unique_filename
        else:
            # Reset pointer
            await file.seek(0)
            local_path = os.path.abspath(os.path.join(settings.UPLOAD_DIR, unique_filename))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            return "local", local_path

    async def upload_bytes(self, file_bytes: bytes, filename: str, project_id: str, document_id: str, content_type: str = "application/pdf") -> tuple[str, str]:
        """
        Uploads raw bytes to storage and returns (bucket, key_or_path).
        """
        file_extension = os.path.splitext(filename)[1]
        unique_filename = f"{project_id}/{document_id}{file_extension}"
        
        if self.use_s3:
            import io
            file_obj = io.BytesIO(file_bytes)
            self.s3_client.upload_fileobj(
                file_obj,
                settings.S3_BUCKET_NAME,
                unique_filename,
                ExtraArgs={"ContentType": content_type}
            )
            return settings.S3_BUCKET_NAME, unique_filename
        else:
            local_path = os.path.abspath(os.path.join(settings.UPLOAD_DIR, unique_filename))
            os.makedirs(os.path.dirname(local_path), exist_ok=True)
            with open(local_path, "wb") as buffer:
                buffer.write(file_bytes)
            return "local", local_path

    def delete_file(self, bucket: str, key: str) -> bool:
        if bucket == "local":
            if os.path.exists(key):
                os.remove(key)
                # Try cleaning up project directory if empty
                proj_dir = os.path.dirname(key)
                try:
                    if os.path.exists(proj_dir) and not os.listdir(proj_dir):
                        os.rmdir(proj_dir)
                except Exception:
                    pass
                return True
            return False
        elif self.use_s3:
            try:
                self.s3_client.delete_object(Bucket=bucket, Key=key)
                return True
            except Exception:
                return False
        else:
            return False

    def get_file_bytes(self, bucket: str, key: str) -> bytes:
        if bucket == "local":
            with open(key, "rb") as f:
                return f.read()
        elif self.use_s3:
            response = self.s3_client.get_object(Bucket=bucket, Key=key)
            return response["Body"].read()
        else:
            raise ValueError(f"S3 storage is not configured, and bucket '{bucket}' is not local.")

storage_service = StorageService()
