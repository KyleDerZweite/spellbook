"""Reviewed public failures and JSON responses for the representative adapters."""

from collections.abc import Mapping
from logging import getLogger

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from psycopg import Error as PsycopgError
from spellbook_core.errors import (
    ActorError,
    AuthError,
    ProfileError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.mtg.categories.common import (
    CategoryConflict,
    CategoryMergeConflict,
    CategoryNotFound,
    CategoryPreviewCapacity,
    CategoryPreviewExpired,
    CategoryUnavailable,
    LibraryConflict,
)
from spellbook_core.mtg.decks import DeckLibraryRevisionChanged
from spellbook_core.mtg.errors import (
    DeckNotFoundError,
    DescriptionConflictError,
    InventoryCountError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
)
from spellbook_core.mtg.profile import SummaryRangeError
from spellbook_core.mtg.scan import ScanError
from spellbook_core.mtg.valuation import InventoryPriceNotFound, PriceReadUnavailable
from spellbook_core.qr import QrAuthError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse, Response

logger = getLogger(__name__)


class HttpError(Exception):
    def __init__(self, status: int, body: str | Mapping[str, object]) -> None:
        if not 400 <= status <= 599:
            raise ValueError("Invalid HTTP error status")
        self.status = status
        self.body = {"message": body} if isinstance(body, str) else dict(body)
        super().__init__(str(self.body["message"]))


def json_response(
    value: object, *, status: int = 200, headers: Mapping[str, str] | None = None
) -> Response:
    return JSONResponse(value, status_code=status, headers=headers, media_type="application/json")


def error_response(cause: Exception) -> Response:
    if isinstance(cause, QrAuthError):
        status = {
            "ValidationFailed": 400,
            "Unauthenticated": 401,
            "NotFound": 404,
            "Conflict": 409,
            "RateLimited": 429,
        }[cause.kind]
        cause = HttpError(status, dict(kind=cause.kind, message=str(cause)))
    elif isinstance(cause, ProfileError):
        cause = HttpError(400, dict(kind=cause.kind, message=str(cause), fields=cause.fields))
    elif isinstance(cause, PriceReadUnavailable):
        cause = HttpError(503, str(cause))
    elif isinstance(cause, InventoryPriceNotFound):
        cause = HttpError(404, str(cause))
    elif isinstance(cause, ScanError):
        cause = HttpError(cause.status, dict(kind=cause.kind, message=str(cause)))
    elif isinstance(cause, DeckLibraryRevisionChanged):
        cause = HttpError(409, dict(kind="RevisionChanged", message=str(cause)))
    elif isinstance(cause, (DeckNotFoundError, CategoryNotFound)):
        cause = HttpError(404, dict(kind="NotFound", message=str(cause)))
    elif isinstance(cause, CategoryConflict):
        cause = HttpError(409, dict(kind=cause.kind, message=str(cause), latest=cause.latest))
    elif isinstance(cause, CategoryMergeConflict):
        cause = HttpError(409, dict(kind=cause.kind, message=str(cause), preview=cause.preview))
    elif isinstance(cause, (LibraryConflict, CategoryPreviewExpired)):
        cause = HttpError(409, dict(kind=cause.kind, message=str(cause)))
    elif isinstance(cause, (CategoryPreviewCapacity, CategoryUnavailable)):
        cause = HttpError(503, dict(kind=cause.kind, message=str(cause)))
    elif isinstance(cause, NotesConflictError):
        cause = HttpError(409, {"kind": "NotesConflict", "message": str(cause), **cause.latest})
    elif isinstance(cause, DescriptionConflictError):
        cause = HttpError(
            409, {"kind": "DescriptionConflict", "message": str(cause), **cause.latest}
        )
    elif isinstance(cause, InventoryQuantityChangedError):
        cause = HttpError(
            409,
            {
                "kind": "QuantityChanged",
                "message": str(cause),
                "latestQuantity": cause.latest_quantity,
            },
        )
    elif isinstance(cause, InventoryNotFoundError):
        cause = HttpError(404, {"kind": "NotFound", "message": str(cause)})
    elif isinstance(cause, RequestConflictError):
        cause = HttpError(409, {"kind": "RequestConflict", "message": str(cause)})
    elif isinstance(cause, InventoryCountError):
        cause = HttpError(500, "Inventory totals cannot be represented exactly.")
    elif isinstance(cause, SummaryRangeError):
        cause = HttpError(503, str(cause))
    elif isinstance(cause, AuthError):
        cause = HttpError(429, str(cause))
    elif isinstance(cause, ActorError):
        cause = HttpError(401, "Authentication required")
    elif isinstance(cause, ValidationError):
        cause = HttpError(400, str(cause))
    if isinstance(cause, HttpError):
        return json_response({**cause.body, "status": cause.status}, status=cause.status)
    return json_response({"status": 500, "message": "Internal Server Error"}, status=500)


def install_error_handlers(http: FastAPI) -> None:
    async def failure(request: Request, cause: Exception) -> Response:
        if isinstance(cause, PsycopgError):
            logger.error(
                "Database request failed: %s (SQLSTATE %s)", type(cause).__name__, cause.sqlstate
            )
        if isinstance(cause, RequestValidationError):
            response = error_response(HttpError(400, "Invalid request"))
        elif isinstance(cause, HTTPException):
            response = error_response(HttpError(cause.status_code, str(cause.detail)))
            response.headers.update(cause.headers or {})
        else:
            response = error_response(cause)
        # ServerErrorMiddleware renders unexpected errors outside user middleware.
        from spellbook_api.http.policy import response_policy

        response_policy(request.url.path, response)
        return response

    # Handled database failures must not escape after sending a response and close keep-alive.
    for exception in (HttpError, RequestValidationError, HTTPException, PsycopgError, Exception):
        http.add_exception_handler(exception, failure)
    for domain_exception in (
        ActorError,
        AuthError,
        ValidationError,
        RequestConflictError,
        DeckLibraryRevisionChanged,
        DeckNotFoundError,
        CategoryNotFound,
        CategoryConflict,
        CategoryMergeConflict,
        LibraryConflict,
        CategoryPreviewExpired,
        CategoryPreviewCapacity,
        CategoryUnavailable,
        NotesConflictError,
        DescriptionConflictError,
        InventoryQuantityChangedError,
        InventoryNotFoundError,
        InventoryCountError,
        SummaryRangeError,
        ScanError,
        QrAuthError,
        ProfileError,
        PriceReadUnavailable,
        InventoryPriceNotFound,
    ):
        http.add_exception_handler(domain_exception, failure)
