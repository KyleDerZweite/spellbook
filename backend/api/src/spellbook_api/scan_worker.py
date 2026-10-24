"""Actual bounded HTTP adapter for the retained Scan recognition scaffold.

API runtime owns this client and awaits close after requests drain. Promote the
existing httpx2==2.13.1 pin from dev to runtime dependencies during assembly.
Its async streaming client supplies cancellation and bounded response consumption.
"""

import asyncio
import json

import httpx2
from spellbook_core.mtg.scan.types import WorkerInput


def _invalid_constant(value: str) -> object:
    raise ValueError("Invalid worker JSON")


class HttpScanWorker:
    def __init__(self, base_url: str = "http://scan-worker:8080") -> None:
        self._url = base_url.rstrip("/") + "/v1/scan/process"
        self._client = httpx2.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            trust_env=False,
            limits=httpx2.Limits(max_connections=16, max_keepalive_connections=4),
        )

    async def process(self, input: WorkerInput) -> object:
        async with asyncio.timeout(30):
            async with self._client.stream("POST", self._url, json=input) as response:
                if not 200 <= response.status_code < 300:
                    raise RuntimeError("Scan processing failed")
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(body) + len(chunk) > 1024 * 1024:
                        raise RuntimeError("Scan processing failed")
                    body.extend(chunk)
            result: object = json.loads(
                body.decode("utf-8-sig"),
                parse_int=float,
                parse_float=float,
                parse_constant=_invalid_constant,
            )
            return result

    async def close(self) -> None:
        await self._client.aclose()
