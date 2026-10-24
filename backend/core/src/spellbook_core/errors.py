"""Reviewed application failures; HTTP status mapping belongs to the adapter."""


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


class DatabaseIntegerRangeError(Exception):
    def __init__(self) -> None:
        super().__init__("Stored integer cannot be represented as an exact JSON number.")


class ProfileError(Exception):
    kind = "ValidationFailed"

    def __init__(self, message: str, fields: dict[str, str]):
        self.fields = fields
        super().__init__(message)
