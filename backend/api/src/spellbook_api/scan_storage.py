"""Local and S3-compatible Scan storage owned by the API runtime.

S3 uses boto3==1.43.118 for maintained SigV4, endpoint/addressing configuration,
streaming reads and provider errors. Add that precise runtime pin during assembly;
no custom S3 signing or broker is introduced. SDK work runs off the event loop and
settles before cancellation returns, so upload cleanup cannot race a late write.
"""

import asyncio
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from threading import Lock
from typing import Protocol, cast

from spellbook_core.mtg.scan import ScanImage
from spellbook_core.mtg.scan.validation import MAX_IMAGE_BYTES, ScanError, check_image

_UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
_KEY = re.compile(rf"scan-sessions/{_UUID}/{_UUID}\.(jpg|png|webp)")


@dataclass(frozen=True, slots=True)
class ScanStorageConfiguration:
    storage_driver: str = "local"
    local_storage_dir: str = "/app/storage/scans"
    s3_endpoint: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket: str = "spellbook-scans"
    s3_access_key_id: str | None = field(default=None, repr=False)
    s3_secret_access_key: str | None = field(default=None, repr=False)
    s3_force_path_style: str = "true"

    @classmethod
    def from_environment(cls, env: Mapping[str, str]) -> ScanStorageConfiguration:
        return cls(
            storage_driver=env.get("SCAN_STORAGE_DRIVER", "local"),
            local_storage_dir=env.get("SCAN_LOCAL_STORAGE_DIR", "/app/storage/scans"),
            s3_endpoint=env.get("S3_ENDPOINT"),
            s3_region=env.get("S3_REGION", "us-east-1"),
            s3_bucket=env.get("S3_BUCKET", "spellbook-scans"),
            s3_access_key_id=env.get("S3_ACCESS_KEY_ID"),
            s3_secret_access_key=env.get("S3_SECRET_ACCESS_KEY"),
            s3_force_path_style=env.get("S3_FORCE_PATH_STYLE", "true"),
        )


class _StreamingBody(Protocol):
    def read(self, amt: int) -> bytes: ...
    def close(self) -> None: ...


class _S3Client(Protocol):
    def put_object(self, *, Bucket: str, Key: str, Body: bytes, ContentType: str) -> object: ...
    def get_object(self, *, Bucket: str, Key: str) -> Mapping[str, object]: ...
    def delete_object(self, *, Bucket: str, Key: str) -> object: ...
    def close(self) -> None: ...


async def _settled[T](operation: Callable[[], T]) -> T:
    task = asyncio.create_task(asyncio.to_thread(operation))
    try:
        return await asyncio.shield(task)
    except asyncio.CancelledError:
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                continue
        # Retrieve a failed SDK operation without replacing request cancellation.
        if not task.cancelled():
            task.exception()
        raise


class ScanObjectStorage:
    def __init__(self, config: ScanStorageConfiguration):
        self._config = config
        self._root = Path(config.local_storage_dir).absolute()
        self._client: _S3Client | None = None
        self._client_lock = Lock()
        self._slots = asyncio.Semaphore(4)
        self._closed = False

    def _target(self, key: str) -> Path:
        if not _KEY.fullmatch(key):
            raise ScanError("ScanNotFound", "Scan image not found", 404)
        path = self._root / key
        # Reject local symlink escapes as well as syntactically invalid keys.
        if not path.resolve().is_relative_to(self._root.resolve()):
            raise ScanError("ScanNotFound", "Scan image not found", 404)
        return path

    def _s3(self) -> _S3Client:
        with self._client_lock:
            if self._client is None:
                config = self._config
                if (
                    not config.s3_endpoint
                    or not config.s3_access_key_id
                    or not config.s3_secret_access_key
                ):
                    raise RuntimeError("Scan storage is unavailable")
                import boto3  # type: ignore[import-untyped]
                from botocore.config import Config  # type: ignore[import-untyped]

                self._client = cast(
                    _S3Client,
                    boto3.session.Session().client(
                        "s3",
                        endpoint_url=config.s3_endpoint,
                        region_name=config.s3_region,
                        aws_access_key_id=config.s3_access_key_id,
                        aws_secret_access_key=config.s3_secret_access_key,
                        config=Config(
                            signature_version="s3v4",
                            connect_timeout=10,
                            read_timeout=10,
                            retries={"mode": "standard", "total_max_attempts": 2},
                            s3={
                                "addressing_style": "path"
                                if config.s3_force_path_style != "false"
                                else "virtual"
                            },
                            request_checksum_calculation="when_required",
                            response_checksum_validation="when_required",
                        ),
                    ),
                )
            return self._client

    async def _run[T](self, operation: Callable[[], T]) -> T:
        async with self._slots:
            if self._closed:
                raise RuntimeError("Scan storage is closed")
            return await _settled(operation)

    async def write(self, key: str, body: bytes, content_type: str) -> None:
        path = self._target(key)

        def write() -> None:
            if self._config.storage_driver == "s3":
                self._s3().put_object(
                    Bucket=self._config.s3_bucket, Key=key, Body=body, ContentType=content_type
                )
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with path.open("xb") as stream:
                    stream.write(body)

        await self._run(write)

    async def read(self, key: str) -> ScanImage:
        path = self._target(key)

        def read() -> ScanImage:
            try:
                if self._config.storage_driver == "s3":
                    result = self._s3().get_object(Bucket=self._config.s3_bucket, Key=key)
                    raw = result.get("Body")
                    if raw is None:
                        raise ScanError("ScanNotFound", "Scan image not found", 404)
                    stream = cast(_StreamingBody, raw)
                    try:
                        body = stream.read(MAX_IMAGE_BYTES + 1)
                    finally:
                        stream.close()
                else:
                    with path.open("rb") as local:
                        body = local.read(MAX_IMAGE_BYTES + 1)
                return ScanImage(body, check_image(body))
            except FileNotFoundError:
                raise ScanError("ScanNotFound", "Scan image not found", 404) from None
            except Exception as cause:
                # Botocore's ClientError is intentionally kept in this runtime adapter.
                response = getattr(cause, "response", None)
                if (
                    isinstance(response, dict)
                    and response.get("Error", {}).get("Code") == "NoSuchKey"
                ):
                    raise ScanError("ScanNotFound", "Scan image not found", 404) from None
                raise

        return await self._run(read)

    async def delete(self, key: str) -> None:
        path = self._target(key)

        def delete() -> None:
            if self._config.storage_driver == "s3":
                self._s3().delete_object(Bucket=self._config.s3_bucket, Key=key)
            else:
                path.unlink(missing_ok=True)

        await self._run(delete)

    async def close(self) -> None:
        # The application drains requests before closing this runtime-owned resource.
        self._closed = True
        if self._client is not None:
            await _settled(self._client.close)


def create_scan_storage(config: ScanStorageConfiguration) -> ScanObjectStorage:
    return ScanObjectStorage(config)
