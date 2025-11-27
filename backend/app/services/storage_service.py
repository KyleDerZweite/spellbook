"""
Storage Service for Spellbook v2.0

S3-compatible storage service for managing card scan images.
Supports MinIO for self-hosted deployments and AWS S3 for cloud.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta
from io import BytesIO
from pathlib import Path
from typing import Optional, BinaryIO, Tuple
from PIL import Image

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import settings

logger = logging.getLogger(__name__)


class StorageService:
    """
    Async S3-compatible storage service for image management.
    
    Handles:
    - Uploading original scan images
    - Creating and storing thumbnails
    - Generating presigned URLs for secure access
    - Managing image lifecycle
    """
    
    def __init__(self):
        self.session = aioboto3.Session()
        self.config = Config(
            signature_version='s3v4',
            retries={'max_attempts': 3, 'mode': 'adaptive'}
        )
        
        # Bucket names
        self.scans_bucket = settings.MINIO_SCANS_BUCKET
        self.cards_bucket = settings.MINIO_CARDS_BUCKET
        
        # Image settings
        self.thumbnail_size = (300, 420)  # Card aspect ratio ~2.5:3.5
        self.max_image_size = 10 * 1024 * 1024  # 10MB
        self.allowed_types = {'image/jpeg', 'image/png', 'image/webp'}
    
    def _get_client_params(self) -> dict:
        """Get parameters for S3 client"""
        return {
            'service_name': 's3',
            'endpoint_url': settings.MINIO_ENDPOINT,
            'aws_access_key_id': settings.MINIO_ACCESS_KEY,
            'aws_secret_access_key': settings.MINIO_SECRET_KEY,
            'config': self.config
        }
    
    async def upload_scan_image(
        self,
        file_data: bytes,
        user_id: uuid.UUID,
        batch_id: Optional[uuid.UUID] = None,
        content_type: str = 'image/jpeg'
    ) -> Tuple[str, str, dict]:
        """
        Upload a scan image and create a thumbnail.
        
        Args:
            file_data: Raw image bytes
            user_id: Owner of the scan
            batch_id: Optional batch ID for grouping
            content_type: MIME type of the image
            
        Returns:
            Tuple of (original_key, thumbnail_key, metadata)
        """
        if content_type not in self.allowed_types:
            raise ValueError(f"Unsupported image type: {content_type}")
        
        if len(file_data) > self.max_image_size:
            raise ValueError(f"Image too large. Maximum size is {self.max_image_size // 1024 // 1024}MB")
        
        # Generate keys
        timestamp = datetime.utcnow().strftime('%Y/%m/%d')
        scan_id = uuid.uuid4()
        extension = self._get_extension(content_type)
        
        if batch_id:
            original_key = f"scans/{user_id}/{batch_id}/{timestamp}/{scan_id}.{extension}"
            thumbnail_key = f"scans/{user_id}/{batch_id}/{timestamp}/{scan_id}_thumb.webp"
        else:
            original_key = f"scans/{user_id}/{timestamp}/{scan_id}.{extension}"
            thumbnail_key = f"scans/{user_id}/{timestamp}/{scan_id}_thumb.webp"
        
        # Process image to get metadata
        image = Image.open(BytesIO(file_data))
        metadata = {
            'width': image.width,
            'height': image.height,
            'format': image.format,
            'mode': image.mode,
            'size': len(file_data)
        }
        
        # Create thumbnail
        thumbnail_data = self._create_thumbnail(image)
        
        async with self.session.client(**self._get_client_params()) as s3:
            # Upload original
            await s3.put_object(
                Bucket=self.scans_bucket,
                Key=original_key,
                Body=file_data,
                ContentType=content_type,
                Metadata={
                    'user_id': str(user_id),
                    'batch_id': str(batch_id) if batch_id else '',
                    'scan_id': str(scan_id),
                    'uploaded_at': datetime.utcnow().isoformat()
                }
            )
            
            # Upload thumbnail
            await s3.put_object(
                Bucket=self.scans_bucket,
                Key=thumbnail_key,
                Body=thumbnail_data,
                ContentType='image/webp'
            )
        
        logger.info(f"Uploaded scan image: {original_key}")
        return original_key, thumbnail_key, metadata
    
    async def get_presigned_url(
        self,
        key: str,
        bucket: Optional[str] = None,
        expires_in: int = 3600
    ) -> str:
        """
        Generate a presigned URL for accessing an image.
        
        Args:
            key: S3 object key
            bucket: Bucket name (defaults to scans bucket)
            expires_in: URL expiration time in seconds
            
        Returns:
            Presigned URL string
        """
        bucket = bucket or self.scans_bucket
        
        async with self.session.client(**self._get_client_params()) as s3:
            url = await s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=expires_in
            )
        
        return url
    
    async def get_scan_urls(
        self,
        original_key: str,
        thumbnail_key: Optional[str] = None,
        expires_in: int = 3600
    ) -> dict:
        """
        Get presigned URLs for both original and thumbnail.
        
        Args:
            original_key: Key for original image
            thumbnail_key: Key for thumbnail (optional)
            expires_in: URL expiration time
            
        Returns:
            Dict with 'original_url' and optionally 'thumbnail_url'
        """
        result = {
            'original_url': await self.get_presigned_url(original_key, expires_in=expires_in)
        }
        
        if thumbnail_key:
            result['thumbnail_url'] = await self.get_presigned_url(thumbnail_key, expires_in=expires_in)
        
        return result
    
    async def delete_scan_images(
        self,
        original_key: str,
        thumbnail_key: Optional[str] = None,
        processed_key: Optional[str] = None
    ) -> bool:
        """
        Delete scan images from storage.
        
        Args:
            original_key: Key for original image
            thumbnail_key: Key for thumbnail
            processed_key: Key for processed image
            
        Returns:
            True if successful
        """
        keys_to_delete = [original_key]
        if thumbnail_key:
            keys_to_delete.append(thumbnail_key)
        if processed_key:
            keys_to_delete.append(processed_key)
        
        async with self.session.client(**self._get_client_params()) as s3:
            for key in keys_to_delete:
                try:
                    await s3.delete_object(Bucket=self.scans_bucket, Key=key)
                except ClientError as e:
                    logger.warning(f"Failed to delete {key}: {e}")
        
        logger.info(f"Deleted scan images: {keys_to_delete}")
        return True
    
    async def download_image(self, key: str, bucket: Optional[str] = None) -> bytes:
        """
        Download an image from storage.
        
        Args:
            key: S3 object key
            bucket: Bucket name
            
        Returns:
            Image bytes
        """
        bucket = bucket or self.scans_bucket
        
        async with self.session.client(**self._get_client_params()) as s3:
            response = await s3.get_object(Bucket=bucket, Key=key)
            data = await response['Body'].read()
        
        return data
    
    async def save_processed_image(
        self,
        image: Image.Image,
        original_key: str
    ) -> str:
        """
        Save a processed version of an image.
        
        Args:
            image: PIL Image object
            original_key: Key of the original image
            
        Returns:
            Key of the processed image
        """
        # Generate processed key
        processed_key = original_key.replace('.', '_processed.')
        if not processed_key.endswith('.webp'):
            processed_key = processed_key.rsplit('.', 1)[0] + '_processed.webp'
        
        # Convert to WebP for efficiency
        buffer = BytesIO()
        image.save(buffer, format='WEBP', quality=90)
        processed_data = buffer.getvalue()
        
        async with self.session.client(**self._get_client_params()) as s3:
            await s3.put_object(
                Bucket=self.scans_bucket,
                Key=processed_key,
                Body=processed_data,
                ContentType='image/webp'
            )
        
        return processed_key
    
    async def ensure_buckets_exist(self) -> bool:
        """
        Ensure required buckets exist, create if needed.
        
        Returns:
            True if buckets are ready
        """
        async with self.session.client(**self._get_client_params()) as s3:
            for bucket in [self.scans_bucket, self.cards_bucket]:
                try:
                    await s3.head_bucket(Bucket=bucket)
                    logger.info(f"Bucket exists: {bucket}")
                except ClientError:
                    try:
                        await s3.create_bucket(Bucket=bucket)
                        logger.info(f"Created bucket: {bucket}")
                    except ClientError as e:
                        logger.error(f"Failed to create bucket {bucket}: {e}")
                        return False
        
        return True
    
    async def get_storage_stats(self, user_id: uuid.UUID) -> dict:
        """
        Get storage statistics for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            Dict with storage stats
        """
        prefix = f"scans/{user_id}/"
        total_size = 0
        total_objects = 0
        
        async with self.session.client(**self._get_client_params()) as s3:
            paginator = s3.get_paginator('list_objects_v2')
            async for page in paginator.paginate(Bucket=self.scans_bucket, Prefix=prefix):
                for obj in page.get('Contents', []):
                    total_size += obj['Size']
                    total_objects += 1
        
        return {
            'total_objects': total_objects,
            'total_size_bytes': total_size,
            'total_size_mb': round(total_size / (1024 * 1024), 2)
        }
    
    def _create_thumbnail(self, image: Image.Image) -> bytes:
        """Create a WebP thumbnail from a PIL Image"""
        # Convert to RGB if necessary
        if image.mode in ('RGBA', 'P'):
            image = image.convert('RGB')
        
        # Resize maintaining aspect ratio
        image.thumbnail(self.thumbnail_size, Image.Resampling.LANCZOS)
        
        # Save to WebP
        buffer = BytesIO()
        image.save(buffer, format='WEBP', quality=85)
        return buffer.getvalue()
    
    def _get_extension(self, content_type: str) -> str:
        """Get file extension from content type"""
        mapping = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        }
        return mapping.get(content_type, 'jpg')


# Global service instance
storage_service = StorageService()
