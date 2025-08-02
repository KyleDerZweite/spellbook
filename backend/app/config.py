from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/spellbookdb"
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379"
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
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
    DESCRIPTION: str = "Card collection management API"
    DEBUG: bool = False
    
    # File storage
    UPLOAD_PATH: str = "/data/uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # Pagination
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100


settings = Settings()