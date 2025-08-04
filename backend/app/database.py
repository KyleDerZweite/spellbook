from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.exc import SQLAlchemyError, OperationalError
from sqlalchemy import text
from fastapi import HTTPException, status
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Database engine with enhanced error handling and connection management
try:
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
        pool_recycle=3600,
        # Connection timeout settings
        connect_args={
            "command_timeout": 60,
            "server_settings": {
                "application_name": "spellbook_api",
                "jit": "off"
            }
        }
    )
    logger.info("Database engine created successfully")
except Exception as e:
    logger.error(f"Failed to create database engine: {e}")
    raise

async_session_maker = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


class Base(DeclarativeBase):
    pass


class DatabaseError(Exception):
    """Custom database error for better error handling"""
    def __init__(self, message: str, original_error: Exception = None):
        self.message = message
        self.original_error = original_error
        super().__init__(self.message)


async def get_async_session() -> AsyncSession:
    """Get async database session with proper error handling"""
    session = None
    try:
        session = async_session_maker()
        yield session
    except OperationalError as e:
        logger.error(f"Database operational error: {e}")
        if session:
            await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed. Please try again later."
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error: {e}")
        if session:
            await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed"
        )
    except Exception as e:
        # Don't catch application-level exceptions that should be handled by global handlers
        from app.core.exceptions import SpellbookException
        if isinstance(e, SpellbookException):
            if session:
                await session.rollback()
            raise  # Re-raise to let global exception handlers handle it
        
        logger.error(f"Unexpected database error: {e}")
        if session:
            await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred"
        )
    finally:
        if session:
            await session.close()


async def check_database_health() -> bool:
    """Check database connectivity and health"""
    try:
        async with engine.begin() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        return False


async def handle_database_operation(operation, *args, **kwargs):
    """Wrapper for database operations with consistent error handling"""
    try:
        return await operation(*args, **kwargs)
    except OperationalError as e:
        logger.error(f"Database operational error in {operation.__name__}: {e}")
        raise DatabaseError("Database connection lost", e)
    except SQLAlchemyError as e:
        logger.error(f"Database error in {operation.__name__}: {e}")
        raise DatabaseError("Database operation failed", e)
    except Exception as e:
        logger.error(f"Unexpected error in {operation.__name__}: {e}")
        raise DatabaseError("Unexpected database error", e)