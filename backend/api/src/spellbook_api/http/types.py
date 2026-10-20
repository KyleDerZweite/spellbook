"""Explicit host configuration and shutdown ownership."""

import ipaddress
import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field

from fastapi import FastAPI
from psycopg.conninfo import conninfo_to_dict
from pydantic import AnyHttpUrl, ValidationError

type AsyncClose = Callable[[], Awaitable[None]]


@dataclass(frozen=True)
class Configuration:
    public_origin: str
    host: str = "127.0.0.1"
    port: int = 3002
    database_url: str | None = field(default=None, repr=False)

    def __post_init__(self) -> None:
        try:
            origin = AnyHttpUrl(self.public_origin)
        except ValidationError:
            raise ValueError(
                "APP_ORIGIN must be an absolute HTTP(S) origin without a path"
            ) from None
        if origin.host is None:
            raise ValueError("APP_ORIGIN must be an absolute HTTP(S) origin without a path")
        # Compare the parsed canonical origin, as the existing Node host does.
        # This also rejects changed numeric-host, IDNA, port and escaping spellings.
        authority = origin.host
        port = origin.port
        if port is not None and port != {"http": 80, "https": 443}[origin.scheme]:
            authority += f":{port}"
        if self.public_origin != f"{origin.scheme}://{authority}":
            raise ValueError("APP_ORIGIN must be a canonical HTTP(S) origin")
        if not ipaddress.ip_address(self.host).is_loopback:
            raise ValueError("The dormant candidate requires a loopback API_HOST")
        if not 1 <= self.port <= 65535:
            raise ValueError("API_PORT must be between 1 and 65535")
        if self.database_url is not None:
            try:
                if not self.database_url.strip():
                    raise ValueError("Empty connection configuration")
                conninfo_to_dict(self.database_url)
            except Exception:
                raise ValueError(
                    "DATABASE_URL must be a valid PostgreSQL connection string"
                ) from None

    @classmethod
    def from_environment(cls, env: Mapping[str, str]) -> Configuration:
        raw_port = env.get("API_PORT", "3002")
        if not re.fullmatch(r"[0-9]+", raw_port):
            raise ValueError("API_PORT must be between 1 and 65535")
        return cls(
            public_origin=env.get("APP_ORIGIN", "").strip(),
            host=env.get("API_HOST", "127.0.0.1").strip(),
            port=int(raw_port),
            database_url=env.get("DATABASE_URL") or None,
        )


@dataclass(frozen=True)
class ApplicationLifetime:
    """The host closes streams before Uvicorn drains, then closes owned resources.

    The application factory supplies pool, listener and executor composition.
    Callbacks must be idempotent and settle owned work on cancellation.
    """

    http: FastAPI
    close_streams: AsyncClose
    close: AsyncClose
