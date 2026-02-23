from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, ValidationInfo
from typing import Optional
import re
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/spellbookdb"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # Auth (Identity-Aware Proxy)
    AUTH_HEADER: str = "Remote-User"
    AUTH_EMAIL_HEADER: str = "Remote-Email"
    AUTH_NAME_HEADER: str = "Remote-Name"
    ENFORCE_TRUSTED_PROXY: bool = False
    TRUSTED_PROXY_CIDRS: str = "10.89.0.0/16,127.0.0.1/32,::1/128"
    
    # Scryfall API
    SCRYFALL_API_BASE: str = "https://api.scryfall.com"
    SCRYFALL_RATE_LIMIT: int = 10  # requests per second
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    
    # App settings
    PROJECT_NAME: str = "Spellbook API"
    VERSION: str = "2.0.0"
    DESCRIPTION: str = "A comprehensive API for managing trading card collections with user authentication, card database, collection management, mobile scanning, and deck building."
    DEBUG: bool = False
    
    # File storage (legacy)
    UPLOAD_PATH: str = "/data/uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # MinIO/S3 Object Storage
    MINIO_ENDPOINT: str = "http://localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_SCANS_BUCKET: str = "spellbook-scans"
    MINIO_CARDS_BUCKET: str = "spellbook-cards"
    MINIO_USE_SSL: bool = False
    
    # Scan Processing
    SCAN_CONFIDENCE_THRESHOLD: float = 0.85  # Minimum confidence for auto-confirm
    OCR_WORKER_THREADS: int = 4              # Thread pool size for OCR
    MAX_SCAN_RETRIES: int = 3                # Retry failed scans
    SCAN_BATCH_SIZE: int = 50                # Max scans per batch
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # Registration mode
    REGISTRATION_MODE: str = "OPEN"  # OPEN, INVITE_ONLY, ADMIN_APPROVAL
    
    # Admin contact
    ADMIN_EMAIL: str = "admin@spellbook.local"  # Contact email for suspended users
    
    # Card caching settings
    CARD_CACHE_DAYS: int = 30                    # How long to keep search results
    AUTO_CLEANUP_ENABLED: bool = True            # Automatic cache cleanup
    PERMANENT_ON_COLLECTION_ADD: bool = True     # Make permanent when added to collection
    
    # Card index initialization settings
    AUTO_INIT_CARD_INDEX: bool = True            # Auto-download bulk data on first startup if index is empty
    AUTO_UPDATE_CARD_INDEX: bool = True          # Automatically update card index on startup
    CARD_INDEX_BATCH_SIZE: int = 2000            # Batch size for card index inserts (higher = faster)
    MIN_CARDS_FOR_VALID_INDEX: int = 10000       # Minimum cards to consider index valid
    MIN_STORAGE_GB: int = 10                     # Minimum storage space required (GB)
    FORCE_CARD_INDEX_REFRESH: bool = False       # Force refresh card index even if it exists


    # The following variables are read from the .env file
    POSTGRES_USER: str = "user"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "spellbookdb"
    NEXT_PUBLIC_API_URL: str = "http://localhost:8000/api/v1"
    ADMIN_EMAIL: str = "admin@spellbook.local"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin123!"
    FRONTEND_PORT: int = 3000
    BACKEND_PORT: int = 8000
    POSTGRES_PORT: int = 5432
    REDIS_PORT: int = 6379
    POSTGRES_DATA_PATH: str = "./data/postgres"
    REDIS_DATA_PATH: str = "./data/redis"
    UPLOADS_DATA_PATH: str = "./data/uploads"

    @field_validator('DATABASE_URL')
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        """Validate database URL format"""
        if not v or v.strip() == "":
            raise ValueError("DATABASE_URL cannot be empty")
        
        if not v.startswith(('postgresql://', 'postgresql+asyncpg://')):
            raise ValueError(
                "DATABASE_URL must be a PostgreSQL connection string "
                "starting with 'postgresql://' or 'postgresql+asyncpg://'"
            )
        
        return v

    @field_validator('REGISTRATION_MODE')
    @classmethod
    def validate_registration_mode(cls, v: str) -> str:
        """Validate registration mode"""
        valid_modes = ['OPEN', 'INVITE_ONLY', 'ADMIN_APPROVAL']
        if v not in valid_modes:
            raise ValueError(f"REGISTRATION_MODE must be one of: {', '.join(valid_modes)}")
        return v

    @staticmethod
    def _is_debug_mode() -> bool:
        """Check if we're in debug mode"""
        return os.getenv('DEBUG', 'false').lower() in ('true', '1', 'yes', 'on')

    def validate_environment(self) -> None:
        """Validate critical environment variables are properly set"""
        errors = []
        
        # Check if we're in production (not debug mode)
        if not self.DEBUG and not self._is_debug_mode():
            # Production-specific validations
            if "localhost" in self.DATABASE_URL:
                errors.append("DATABASE_URL should not use localhost in production")
            
            if "password" in self.DATABASE_URL and "password@" in self.DATABASE_URL:
                # Only check for default password in production
                if not self.DEBUG:
                    errors.append("DATABASE_URL appears to use default password in production")
        
        # Always check these
        if not self.PROJECT_NAME:
            errors.append("PROJECT_NAME cannot be empty")
        
        if errors:
            error_msg = "Environment validation failed:\n" + "\n".join(f"- {error}" for error in errors)
            raise ValueError(error_msg)


settings = Settings()

# Validate environment on startup
# settings.validate_environment()