"""Reviewed public failures and JSON responses for the representative adapters."""

from collections.abc import Mapping

from spellbook_core.errors import (
    ActorError,
    DescriptionConflictError,
    InventoryCountError,
    InventoryNotFoundError,
    InventoryQuantityChangedError,
    NotesConflictError,
    RequestConflictError,
    ValidationError,
)
from spellbook_core.fingerprint import serialize_json
from starlette.responses import JSONResponse, Response


class HttpError(Exception):
    def __init__(self, status: int, body: str | Mapping[str, object]) -> None:
        if not 400 <= status <= 599:
            raise ValueError("Invalid HTTP error status")
        self.status = status
        self.body = {"message": body} if isinstance(body, str) else dict(body)
        super().__init__(str(self.body["message"]))


class _JSONResponse(JSONResponse):
    def render(self, content: object) -> bytes:
        return serialize_json(content).encode("utf-8")


def json_response(
    value: object, *, status: int = 200, headers: Mapping[str, str] | None = None
) -> Response:
    return _JSONResponse(value, status_code=status, headers=headers, media_type="application/json")


def error_response(cause: Exception) -> Response:
    if isinstance(cause, NotesConflictError):
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
    elif isinstance(cause, ActorError):
        cause = HttpError(401, "Authentication required")
    elif isinstance(cause, ValidationError):
        cause = HttpError(400, str(cause))
    if isinstance(cause, HttpError):
        return json_response({**cause.body, "status": cause.status}, status=cause.status)
    return json_response({"status": 500, "message": "Internal Server Error"}, status=500)
