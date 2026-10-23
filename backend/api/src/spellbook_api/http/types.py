"""Explicit host configuration and shutdown ownership."""

import ipaddress
import re
from collections.abc import Awaitable, Callable, Mapping
from contextlib import suppress
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import FastAPI
from psycopg.conninfo import conninfo_to_dict
from pydantic import AnyHttpUrl, ValidationError
from spellbook_core.validation import js_trim

from spellbook_api.scan_storage import ScanStorageConfiguration

type AsyncClose = Callable[[], Awaitable[None]]


@dataclass(frozen=True)
class Configuration:
    public_origin: str
    host: str = "127.0.0.1"
    port: int = 3002
    database_url: str | None = field(default=None, repr=False)

    demo_mode: bool = False
    trusted_proxy_addresses: tuple[str, ...] = ()
    value_history_timezone: str = "Europe/Berlin"
    scan_storage: ScanStorageConfiguration = field(default_factory=ScanStorageConfiguration)
    scan_worker_url: str = "http://scan-worker:8080"
    commander_spellbook_enabled: bool = False

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
        timezone = js_trim(self.value_history_timezone) or "Europe/Berlin"
        try:
            ZoneInfo(timezone)
        except ZoneInfoNotFoundError, ValueError:
            raise ValueError("VALUE_HISTORY_TIMEZONE must be a valid IANA timezone") from None
        object.__setattr__(self, "value_history_timezone", timezone)
        normalized_proxies: list[str] = []
        for proxy in self.trusted_proxy_addresses:
            try:
                ipaddress.ip_address(proxy)
            except ValueError:
                raise ValueError(
                    "API_TRUSTED_PROXY_ADDRESSES accepts comma-separated IP addresses only"
                ) from None
            normalized = proxy
            if proxy.startswith("::ffff:"):
                with suppress(ValueError):
                    normalized = str(ipaddress.IPv4Address(proxy[7:]))
            normalized_proxies.append(normalized)
        object.__setattr__(self, "trusted_proxy_addresses", tuple(normalized_proxies))
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
        combo = env.get("COMMANDER_SPELLBOOK_ENABLED", "false")
        if combo not in {"true", "false"}:
            raise ValueError("COMMANDER_SPELLBOOK_ENABLED must be true or false")
        return cls(
            public_origin=env.get("APP_ORIGIN", "").strip(),
            host=env.get("API_HOST", "127.0.0.1").strip(),
            port=int(raw_port),
            database_url=env.get("DATABASE_URL") or None,
            demo_mode=env.get("DEMO_MODE") == "true",
            commander_spellbook_enabled=combo == "true",
            scan_storage=ScanStorageConfiguration.from_environment(env),
            scan_worker_url=env.get("SCAN_WORKER_URL", "http://scan-worker:8080"),
            value_history_timezone=env.get("VALUE_HISTORY_TIMEZONE", "Europe/Berlin"),
            trusted_proxy_addresses=tuple(
                part.strip()
                for part in env.get("API_TRUSTED_PROXY_ADDRESSES", "").split(",")
                if part.strip()
            ),
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
