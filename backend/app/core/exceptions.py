"""
Custom exception classes for the Spellbook API
"""
from fastapi import HTTPException, status
from typing import Any, Dict, Optional


class SpellbookException(Exception):
    """Base exception class for Spellbook application"""
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


class AuthenticationError(SpellbookException):
    """Authentication related errors"""
    pass


class AuthorizationError(SpellbookException):
    """Authorization related errors"""
    pass


class ValidationError(SpellbookException):
    """Data validation errors"""
    pass


class ResourceNotFoundError(SpellbookException):
    """Resource not found errors"""
    pass


class ConflictError(SpellbookException):
    """Resource conflict errors"""
    pass


class RateLimitError(SpellbookException):
    """Rate limiting errors"""
    pass


class ExternalServiceError(SpellbookException):
    """External service integration errors"""
    pass


# HTTP Exception helpers
def create_http_exception(
    status_code: int,
    message: str,
    error_type: str = "api_error",
    details: Optional[Dict[str, Any]] = None
) -> HTTPException:
    """Create a standardized HTTP exception"""
    content = {
        "error": {
            "message": message,
            "type": error_type,
            "details": details or {}
        }
    }
    return HTTPException(status_code=status_code, detail=content)


def authentication_exception(message: str = "Authentication required") -> HTTPException:
    """Create authentication error response"""
    return create_http_exception(
        status_code=status.HTTP_401_UNAUTHORIZED,
        message=message,
        error_type="authentication_error"
    )


def authorization_exception(message: str = "Insufficient permissions") -> HTTPException:
    """Create authorization error response"""
    return create_http_exception(
        status_code=status.HTTP_403_FORBIDDEN,
        message=message,
        error_type="authorization_error"
    )


def validation_exception(message: str, field: str = None) -> HTTPException:
    """Create validation error response"""
    details = {"field": field} if field else {}
    return create_http_exception(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        message=message,
        error_type="validation_error",
        details=details
    )


def not_found_exception(resource: str = "Resource") -> HTTPException:
    """Create not found error response"""
    return create_http_exception(
        status_code=status.HTTP_404_NOT_FOUND,
        message=f"{resource} not found",
        error_type="not_found_error"
    )


def conflict_exception(message: str = "Resource conflict") -> HTTPException:
    """Create conflict error response"""
    return create_http_exception(
        status_code=status.HTTP_409_CONFLICT,
        message=message,
        error_type="conflict_error"
    )


def rate_limit_exception(message: str = "Rate limit exceeded") -> HTTPException:
    """Create rate limit error response"""
    return create_http_exception(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        message=message,
        error_type="rate_limit_error"
    )


def service_unavailable_exception(message: str = "Service temporarily unavailable") -> HTTPException:
    """Create service unavailable error response"""
    return create_http_exception(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        message=message,
        error_type="service_unavailable_error"
    )


def internal_server_exception(message: str = "Internal server error") -> HTTPException:
    """Create internal server error response"""
    return create_http_exception(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        message=message,
        error_type="internal_server_error"
    )