"""Explicit host configuration and shutdown ownership."""

import ipaddress
import re
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass

from fastapi import FastAPI
from pydantic import AnyHttpUrl, ValidationError

type AsyncClose = Callable[[], Awaitable[None]]


@dataclass(frozen=True)
class Configuration:
    public_origin: str
    host: str = "127.0.0.1"
    port: int = 3002

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

    @classmethod
    def from_environment(cls, env: Mapping[str, str]) -> Configuration:
        raw_port = env.get("API_PORT", "3002")
        if not re.fullmatch(r"[0-9]+", raw_port):
            raise ValueError("API_PORT must be between 1 and 65535")
        return cls(
            public_origin=env.get("APP_ORIGIN", "").strip(),
            host=env.get("API_HOST", "127.0.0.1").strip(),
            port=int(raw_port),
        )


@dataclass(frozen=True)
class ApplicationLifetime:
    """The host closes streams before Uvicorn drains, then closes owned resources.

    P02b supplies the actual application, pool and listener composition here.
    Callbacks must be idempotent and settle owned work on cancellation.
    """

    http: FastAPI
    close_streams: AsyncClose
    close: AsyncClose
