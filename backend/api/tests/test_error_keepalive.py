"""Database failures must not poison the next native HTTP request."""

import asyncio
import json
import socket
from contextlib import suppress
from typing import Any
from unittest.mock import create_autospec

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg.errors import UndefinedTable
from spellbook_core.mtg.inventory import Inventory
from test_catalog_valuation_http import ACTOR, ORIGIN, dependencies

from spellbook_api.http.application import create_http_application
from spellbook_api.http.errors import HttpError
from spellbook_api.http.routes_saved_state import SavedStateRoutes
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.main import CandidateServer

TOKEN = "a" * 43
ENTRY = "11111111-1111-4111-8111-111111111111"
PRICE_BODY = {"entryIds": [ENTRY]}
PRICE_RESULT = {"results": [{"entryId": ENTRY, "quantity": 5}]}


def failure_application(cause: Exception) -> tuple[FastAPI, Any]:
    auth, catalog, valuation = dependencies()
    inventory = create_autospec(Inventory, instance=True)
    inventory.page.side_effect = cause
    valuation.inventory_references.return_value = PRICE_RESULT
    app = create_http_application(
        Configuration(ORIGIN),
        auth=auth,
        catalog=catalog,
        inventory=inventory,
        saved_routes=create_autospec(SavedStateRoutes, instance=True),
        valuation=valuation,
    )
    return app, valuation


@pytest.mark.parametrize("database_failure", [False, True])
def test_failure_does_not_escape_asgi_before_next_price_read(database_failure: bool) -> None:
    cause = (
        UndefinedTable("private database details") if database_failure else HttpError(503, "Busy")
    )
    app, valuation = failure_application(cause)
    with TestClient(app, headers={"Authorization": "Bearer " + TOKEN}) as client:
        failure = client.get("/api/v1/mtg/inventory")
        assert failure.status_code == (500 if database_failure else 503)
        assert failure.json() == (
            {"status": 500, "message": "Internal Server Error"}
            if database_failure
            else {"status": 503, "message": "Busy"}
        )
        assert failure.headers["x-robots-tag"] == "noindex, nofollow"
        response = client.post("/api/v1/mtg/inventory/prices", json=PRICE_BODY)
        assert response.status_code == 200 and response.json() == PRICE_RESULT
    valuation.inventory_references.assert_awaited_once_with(ACTOR, PRICE_BODY)


async def read_response(reader: asyncio.StreamReader) -> tuple[int, dict[str, str], object]:
    lines = (await reader.readuntil(b"\r\n\r\n")).decode().split("\r\n")
    headers = dict(line.lower().split(": ", 1) for line in lines[1:] if line)
    body = await reader.readexactly(int(headers["content-length"]))
    return int(lines[0].split()[1]), headers, json.loads(body)


@pytest.mark.parametrize("database_failure", [False, True])
def test_native_keepalive_survives_inventory_failure_before_price_post(
    database_failure: bool,
) -> None:
    async def scenario() -> None:
        cause = (
            UndefinedTable("private database details")
            if database_failure
            else HttpError(503, "Busy")
        )
        app, valuation = failure_application(cause)

        async def close() -> None:
            pass

        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            server = CandidateServer(
                ApplicationLifetime(app, close, close), Configuration(ORIGIN, port=port)
            )
            server.config.log_level = "critical"
            server.config.configure_logging()
            pending = asyncio.create_task(server.serve(sockets=[listener]))
            writers: list[asyncio.StreamWriter] = []
            try:
                async with asyncio.timeout(3):
                    while not server.started:
                        await asyncio.sleep(0.005)
                    reader, writer = await asyncio.open_connection("127.0.0.1", port)
                    writers.append(writer)
                    headers = f"Host: localhost\r\nAuthorization: Bearer {TOKEN}\r\n"
                    writer.write(
                        ("GET /api/v1/mtg/inventory HTTP/1.1\r\n" + headers + "\r\n").encode()
                    )
                    await writer.drain()
                    status, response_headers, body = await read_response(reader)
                    assert status == (500 if database_failure else 503)
                    assert response_headers.get("connection") != "close"
                    assert body == (
                        {"status": 500, "message": "Internal Server Error"}
                        if database_failure
                        else {"status": 503, "message": "Busy"}
                    )
                    # A fresh-connection control proves the price use case itself is healthy.
                    fresh_reader, fresh_writer = await asyncio.open_connection("127.0.0.1", port)
                    writers.append(fresh_writer)
                    payload = json.dumps(PRICE_BODY).encode()
                    post = (
                        "POST /api/v1/mtg/inventory/prices HTTP/1.1\r\n"
                        + headers
                        + "Content-Type: application/json\r\n"
                        + f"Content-Length: {len(payload)}\r\n\r\n"
                    ).encode() + payload
                    fresh_writer.write(post)
                    await fresh_writer.drain()
                    assert (await read_response(fresh_reader))[::2] == (200, PRICE_RESULT)
                    writer.write(post)
                    await writer.drain()
                    assert (await read_response(reader))[::2] == (200, PRICE_RESULT)
                    assert valuation.inventory_references.await_count == 2
            finally:
                for writer in writers:
                    writer.close()
                    with suppress(ConnectionError):
                        await writer.wait_closed()
                server.should_exit = True
                await asyncio.wait_for(pending, 3)

    asyncio.run(scenario())


def test_unexpected_error_still_escapes_for_server_logging_and_has_safe_body() -> None:
    app, _ = failure_application(RuntimeError("private bug details"))
    with TestClient(app) as client, pytest.raises(RuntimeError, match="private bug details"):
        client.get("/api/v1/mtg/inventory", headers={"Authorization": "Bearer " + TOKEN})
    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get(
            "/api/v1/mtg/inventory", headers={"Authorization": "Bearer " + TOKEN}
        )
        assert response.status_code == 500
        assert response.json() == {"status": 500, "message": "Internal Server Error"}


def test_database_failure_logs_type_and_sqlstate_without_private_details(
    caplog: pytest.LogCaptureFixture,
) -> None:
    app, _ = failure_application(UndefinedTable("private database details"))
    with caplog.at_level("ERROR", logger="spellbook_api.http.errors"), TestClient(app) as client:
        response = client.get(
            "/api/v1/mtg/inventory", headers={"Authorization": "Bearer " + TOKEN}
        )
    assert response.status_code == 500
    assert caplog.messages == ["Database request failed: UndefinedTable (SQLSTATE 42P01)"]
    assert "private database details" not in caplog.text
