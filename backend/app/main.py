from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
from datetime import datetime
from app.config import settings
from app.api.v1 import users, cards, collections, admin, scan
from app.core.exceptions import (
    SpellbookException, 
    AuthenticationError,
    AuthorizationError,
    ValidationError,
    ResourceNotFoundError,
    ConflictError,
    RateLimitError,
    ExternalServiceError
)
from app.database import DatabaseError
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.PROJECT_NAME} v{settings.VERSION}")
    
    # Run startup sequence (card index initialization, health checks)
    from app.services.startup_service import startup_service
    startup_results = await startup_service.run_startup_sequence()
    
    # Log startup results
    if startup_results['status'] == 'success':
        logger.info(f"Application startup completed successfully in {startup_results['duration_seconds']:.1f}s")
    elif startup_results['status'] == 'completed_with_warnings':
        logger.warning(f"Application startup completed with warnings in {startup_results['duration_seconds']:.1f}s")
        for warning in startup_results.get('warnings', []):
            logger.warning(f"Startup warning: {warning}")
    else:
        logger.error(f"Application startup failed in {startup_results.get('duration_seconds', 0):.1f}s")
        logger.error(f"Startup error: {startup_results.get('error', 'Unknown error')}")
        # Continue anyway - let the application start even if card index fails
    
    # Store startup results in app state for health endpoint
    app.state.startup_results = startup_results
    
    yield
    
    # Shutdown
    logger.info("Shutting down application")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
    docs_url="/docs",  # Swagger UI (default)
    redoc_url="/redoc",  # ReDoc alternative
    openapi_url="/openapi.json",  # OpenAPI schema
    contact={
        "name": "Spellbook Team",
        "url": "https://github.com/KyleDerZweite/spellbook",
    },
    license_info={
        "name": "GPLv3",
        "url": "https://www.gnu.org/licenses/gpl-3.0.html",
    },
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Add cache headers middleware for card endpoints
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    
    # Add cache headers for card search endpoints (they're relatively static)
    if request.url.path.startswith("/api/v1/cards/"):
        # Cache card data for 1 hour on client, allow stale for 1 day
        response.headers["Cache-Control"] = "public, max-age=3600, stale-while-revalidate=86400"
    
    return response


# Health check endpoint
@app.get("/health", tags=["Health"])
async def health_check():
    from app.database import check_database_health
    from app.services.startup_service import startup_service
    from app.services.card_data_service import card_data_service
    import shutil
    from pathlib import Path
    
    # Basic database health
    db_healthy = await check_database_health()
    
    # Card index status
    try:
        index_status = await card_data_service.get_status()
        card_count = index_status['total_cards']
        card_index_ready = index_status['is_initialized']
    except Exception:
        card_count = 0
        card_index_ready = False
    
    # Storage information
    try:
        current_path = Path.cwd()
        stat = shutil.disk_usage(current_path)
        free_gb = stat.free / (1024 ** 3)
        total_gb = stat.total / (1024 ** 3)
        storage_info = {
            "free_gb": round(free_gb, 2),
            "total_gb": round(total_gb, 2),
            "sufficient": free_gb >= settings.MIN_STORAGE_GB
        }
    except Exception:
        storage_info = {"error": "Unable to check storage"}
    
    # Startup status
    startup_status = startup_service.get_startup_status()
    
    # Overall status
    overall_healthy = db_healthy and card_index_ready and startup_service.is_ready()
    status_code = "healthy" if overall_healthy else "unhealthy"
    
    health_response = {
        "status": status_code,
        "version": settings.VERSION,
        "project": settings.PROJECT_NAME,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "components": {
            "database": {
                "status": "connected" if db_healthy else "disconnected",
                "healthy": db_healthy
            },
            "card_index": {
                "status": "ready" if card_index_ready else "not_ready",
                "healthy": card_index_ready,
                "card_count": card_count
            },
            "storage": storage_info,
            "startup": {
                "status": startup_status.get("status", "unknown"),
                "complete": startup_status.get("startup_complete", False),
                "ready": startup_service.is_ready()
            }
        }
    }
    
    # Include startup results if available
    if hasattr(app.state, 'startup_results'):
        health_response["startup_results"] = app.state.startup_results
    
    return health_response


# Include API routers
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(cards.router, prefix="/api/v1/cards", tags=["Cards"])
app.include_router(collections.router, prefix="/api/v1/collections", tags=["Collections"])
app.include_router(scan.router, prefix="/api/v1/scan", tags=["Scanning"])
app.include_router(admin.router, prefix="/api/v1/admin", tags=["Admin"])


# Exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle FastAPI validation errors"""
    logger.warning(f"Validation error on {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "message": "Validation failed",
                "type": "validation_error",
                "details": exc.errors()
            }
        }
    )


@app.exception_handler(DatabaseError)
async def database_exception_handler(request: Request, exc: DatabaseError):
    """Handle database errors"""
    logger.error(f"Database error on {request.url}: {exc.message}", exc_info=True)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database operation failed"
        }
    )


@app.exception_handler(AuthenticationError)
async def authentication_exception_handler(request: Request, exc: AuthenticationError):
    """Handle authentication errors"""
    logger.warning(f"Authentication error on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=401,
        content={
            "error": {
                "message": exc.message,
                "type": "authentication_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(AuthorizationError)
async def authorization_exception_handler(request: Request, exc: AuthorizationError):
    """Handle authorization errors"""
    logger.warning(f"Authorization error on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=403,
        content={
            "error": {
                "message": exc.message,
                "type": "authorization_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(ResourceNotFoundError)
async def not_found_exception_handler(request: Request, exc: ResourceNotFoundError):
    """Handle not found errors"""
    logger.info(f"Resource not found on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=404,
        content={
            "error": {
                "message": exc.message,
                "type": "not_found_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(ConflictError)
async def conflict_exception_handler(request: Request, exc: ConflictError):
    """Handle conflict errors"""
    logger.warning(f"Conflict error on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=409,
        content={
            "error": {
                "message": exc.message,
                "type": "conflict_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(RateLimitError)
async def rate_limit_exception_handler(request: Request, exc: RateLimitError):
    """Handle rate limit errors"""
    logger.warning(f"Rate limit exceeded on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "message": exc.message,
                "type": "rate_limit_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(ExternalServiceError)
async def external_service_exception_handler(request: Request, exc: ExternalServiceError):
    """Handle external service errors"""
    logger.error(f"External service error on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=502,
        content={
            "error": {
                "message": exc.message,
                "type": "external_service_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(SpellbookException)
async def spellbook_exception_handler(request: Request, exc: SpellbookException):
    """Handle custom Spellbook exceptions"""
    logger.error(f"Spellbook error on {request.url}: {exc.message}")
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "message": exc.message,
                "type": "application_error",
                "details": exc.details
            }
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions"""
    logger.error(f"Unexpected error on {request.url}: {str(exc)}", exc_info=True)
    
    # Don't expose internal details in production
    message = str(exc) if settings.DEBUG else "An unexpected error occurred"
    
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "message": message,
                "type": "internal_server_error"
            }
        }
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="debug" if settings.DEBUG else "info"
    )