from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, ValidationInfo
from typing import Optional
import re
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/spellbookdb"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT
    SECRET_KEY: str = "development-secret-key-change-in-production-at-least-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Scryfall API
    SCRYFALL_API_BASE: str = "https://api.scryfall.com"
    SCRYFALL_RATE_LIMIT: int = 10  # requests per second
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]
    
    # App settings
    PROJECT_NAME: str = "Spellbook API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = "A comprehensive API for managing trading card collections with user authentication, card database, collection management, deck building, and statistics."
    DEBUG: bool = False
    
    # File storage
    UPLOAD_PATH: str = "/data/uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # Registration mode
    REGISTRATION_MODE: str = "OPEN"  # OPEN, INVITE_ONLY, ADMIN_APPROVAL
    
    # Card caching settings
    CARD_CACHE_DAYS: int = 30                    # How long to keep search results
    SCRYFALL_RATE_LIMIT: int = 10               # API requests per second
    AUTO_CLEANUP_ENABLED: bool = True            # Automatic cache cleanup
    PERMANENT_ON_COLLECTION_ADD: bool = True     # Make permanent when added to collection
    
    # Card index initialization settings
    AUTO_UPDATE_CARD_INDEX: bool = True          # Automatically update card index on startup
    CARD_INDEX_BATCH_SIZE: int = 1000           # Batch size for card index inserts
    MIN_STORAGE_GB: int = 10                    # Minimum storage space required (GB)
    FORCE_CARD_INDEX_REFRESH: bool = False      # Force refresh card index even if it exists

    @field_validator('SECRET_KEY')
    @classmethod
    def validate_secret_key(cls, v: str, info: ValidationInfo) -> str:
        """Validate that SECRET_KEY is secure for production"""
        if not v or v.strip() == "":
            raise ValueError("SECRET_KEY cannot be empty")
        
        # Check minimum length
        if len(v) < 32:
            raise ValueError(
                "SECRET_KEY must be at least 32 characters long for security"
            )
        
        # Production-specific checks (only in production mode)
        debug_mode = os.getenv('DEBUG', 'false').lower() in ('true', '1', 'yes', 'on')
        if not debug_mode:
            if ("development-secret-key" in v or 
                "your-secret-key-change-in-production" in v or
                "dev-secret-key" in v):
                raise ValueError(
                    "SECRET_KEY must be changed from default value in production. "
                    "Use a secure random string of at least 32 characters."
                )
        
        return v

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
            if ("development-secret-key" in self.SECRET_KEY or 
                "your-secret-key-change-in-production" in self.SECRET_KEY or
                "dev-secret-key" in self.SECRET_KEY):
                errors.append("SECRET_KEY must be changed from default in production")
            
            if "localhost" in self.DATABASE_URL:
                errors.append("DATABASE_URL should not use localhost in production")
            
            if "password" in self.DATABASE_URL and "password@" in self.DATABASE_URL:
                errors.append("DATABASE_URL appears to use default password in production")
        
        # Always check these
        if not self.PROJECT_NAME:
            errors.append("PROJECT_NAME cannot be empty")
        
        if self.ACCESS_TOKEN_EXPIRE_MINUTES < 1:
            errors.append("ACCESS_TOKEN_EXPIRE_MINUTES must be at least 1")
        
        if self.REFRESH_TOKEN_EXPIRE_DAYS < 1:
            errors.append("REFRESH_TOKEN_EXPIRE_DAYS must be at least 1")
        
        if errors:
            error_msg = "Environment validation failed:\n" + "\n".join(f"- {error}" for error in errors)
            raise ValueError(error_msg)


settings = Settings()

# Validate environment on startup
settings.validate_environment()