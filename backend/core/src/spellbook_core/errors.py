"""Reviewed application failures; HTTP status mapping belongs to the adapter."""

from .models import DescriptionLatest, NotesLatest


class ValidationError(Exception):
    kind = "ValidationFailed"


class RequestConflictError(ValidationError):
    def __init__(self, message: str = "Request ID was already used for a different mutation"):
        super().__init__(message)


class ActorError(Exception):
    kind = "Unauthenticated"

    def __init__(self) -> None:
        super().__init__("Authentication required")


class AuthError(Exception):
    kind = "RateLimited"


class CatalogPrintingNotFoundError(ValidationError):
    def __init__(self) -> None:
        super().__init__("Catalog printing not found")


class InventoryNotFoundError(ValidationError):
    kind_of_failure = "NotFound"


class InventoryQuantityChangedError(ValidationError):
    kind_of_failure = "QuantityChanged"

    def __init__(self, latest_quantity: int | None):
        self.latest_quantity = latest_quantity
        super().__init__("This entry changed. Review its quantity before removing it.")


class NotesConflictError(ValidationError):
    kind_of_failure = "NotesConflict"

    def __init__(self, latest: NotesLatest):
        self.latest = latest.copy()
        super().__init__(
            "Notes changed. Your draft has been retained. "
            "Review the latest saved Notes before retrying."
        )


class DescriptionConflictError(ValidationError):
    conflict = "DescriptionConflict"

    def __init__(self, latest: DescriptionLatest):
        self.latest = latest.copy()
        super().__init__(
            "Description changed. Your draft has been retained. "
            "Review the latest saved description before retrying."
        )


class DeckNotFoundError(ValidationError):
    not_found = True

    def __init__(self) -> None:
        super().__init__("Deck or entry not found")


class DatabaseIntegerRangeError(Exception):
    def __init__(self) -> None:
        super().__init__("Stored integer cannot be represented as an exact JSON number.")


class InventoryCountError(Exception):
    kind = "InvalidInventoryCount"

    def __init__(self) -> None:
        super().__init__("Inventory totals cannot be represented exactly.")
