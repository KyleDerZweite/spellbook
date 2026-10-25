"""Explicit request-pool, listener, stream and password-executor ownership."""

import asyncio
import os
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool
from spellbook_core.auth import create_local_auth
from spellbook_core.mtg.catalog import create_catalog
from spellbook_core.mtg.categories import configure_combo_adapter, create_categories
from spellbook_core.mtg.dashboard import create_dashboard
from spellbook_core.mtg.decks import create_decks
from spellbook_core.mtg.inventory import create_inventory
from spellbook_core.mtg.inventory_value import create_inventory_values
from spellbook_core.mtg.scan import create_scan
from spellbook_core.mtg.valuation import create_valuation
from spellbook_core.passwords import create_password_verifier
from spellbook_core.profile import create_profile
from spellbook_core.saved_state import create_saved_state

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.application import create_http_application
from spellbook_api.http.routes_saved_state import create_saved_state_routes
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.listener import SavedStateListener
from spellbook_api.scan_storage import create_scan_storage
from spellbook_api.scan_worker import HttpScanWorker


async def _close_discovery() -> None:
    """Discovery owns no external resources or streams."""


class ApplicationResources:
    def __init__(self, configuration: Configuration) -> None:
        assert configuration.database_url is not None
        self.pool: AsyncConnectionPool[AsyncConnection[tuple[object, ...]]] = AsyncConnectionPool(
            configuration.database_url,
            open=False,
            min_size=0,
            max_size=10,
            max_waiting=32,
            timeout=2.0,
            kwargs={
                "connect_timeout": 2,
                "application_name": f"spellbook-python-api:{os.getpid()}",
            },
        )
        configure_combo_adapter(self.pool, configuration.commander_spellbook_enabled)
        self.admission = RequestAdmission()
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="spellbook-scrypt")
        self.passwords = create_password_verifier(self.executor)
        self.listener = SavedStateListener(configuration.database_url)
        self.auth = create_local_auth(self.pool, self.passwords, configuration.demo_mode)
        self.profile = create_profile(self.pool, self.auth, configuration.demo_mode)
        self.catalog = create_catalog(self.pool)
        self.categories = create_categories(self.pool, self.auth)
        self.valuation = create_valuation(
            self.pool, self.auth, timezone=configuration.value_history_timezone
        )
        self.inventory_values = create_inventory_values(
            self.pool, self.valuation, timezone=self.valuation.timezone
        )
        self.dashboard = create_dashboard(self.pool, self.auth, self.inventory_values)
        self.inventory = create_inventory(self.pool, self.catalog, self.auth)
        self.decks = create_decks(self.pool, self.catalog, self.auth, self.valuation)
        self.scan_storage = create_scan_storage(configuration.scan_storage)
        self.scan_worker = HttpScanWorker(configuration.scan_worker_url)
        self.scan = create_scan(
            self.pool, self.catalog, self.auth, self.inventory, self.scan_storage, self.scan_worker
        )
        self.saved_state = create_saved_state(
            self.auth,
            ensure_listener=self.listener.ensure_listener,
            request_listener_recovery=self.listener.request_recovery,
        )
        self.saved_routes = create_saved_state_routes(
            self.auth, self.saved_state, configuration.public_origin
        )
        self._close_task: asyncio.Task[None] | None = None
        self._closing = False
        self._started = False

    async def start(self) -> None:
        if self._closing:
            raise RuntimeError("Application resources are closed")
        if self._started:
            return
        self._started = True
        await self.pool.open()
        # Acquiring proves actual startup connectivity, without application SQL or migration.
        async with self.pool.connection(timeout=2.0):
            pass
        self.saved_state.start()
        self.listener.start(self.saved_state)

    async def close_streams(self) -> None:
        self._closing = True
        self.admission.close_admission()
        self.saved_state.close_admission()
        self.passwords.close_admission()
        await self.saved_routes.close_streams()

    async def _close(self) -> None:
        try:
            await self.close_streams()
        finally:
            try:
                try:
                    await self.admission.settle()
                finally:
                    await self.listener.close()
            finally:
                try:
                    await self.saved_state.close()
                finally:
                    try:
                        try:
                            await self.scan_worker.close()
                        finally:
                            await self.scan_storage.close()
                    finally:
                        try:
                            try:
                                await self.passwords.settle()
                            finally:
                                self.executor.shutdown(wait=True)
                        finally:
                            await self.pool.close()

    async def close(self) -> None:
        if self._close_task is None:
            self._close_task = asyncio.create_task(
                self._close(), name="application-resources-close"
            )
        # Keep cleanup owned after caller cancellation, without shield's late-error
        # reporting path. Every remaining waiter still receives the real result.
        waiter: asyncio.Future[None] = asyncio.get_running_loop().create_future()

        def settled(task: asyncio.Task[None]) -> None:
            if not task.cancelled():
                task.exception()
            if not waiter.done():
                waiter.set_result(None)

        self._close_task.add_done_callback(settled)
        await waiter
        self._close_task.result()


def create_application(configuration: Configuration) -> ApplicationLifetime:
    if configuration.database_url is None:
        return ApplicationLifetime(
            create_http_application(configuration), _close_discovery, _close_discovery
        )
    resources = ApplicationResources(configuration)
    try:
        http = create_http_application(
            configuration,
            auth=resources.auth,
            profile=resources.profile,
            catalog=resources.catalog,
            inventory=resources.inventory,
            valuation=resources.valuation,
            dashboard=resources.dashboard,
            scan=resources.scan,
            categories=resources.categories,
            decks=resources.decks,
            saved_routes=resources.saved_routes,
            admission=resources.admission,
        )
    except BaseException:
        # No asynchronous resource has opened during construction.
        resources.executor.shutdown(wait=True)
        raise

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            await resources.start()
            yield
        finally:
            await resources.close()

    http.router.lifespan_context = lifespan
    http.state.resources = resources
    return ApplicationLifetime(http, resources.close_streams, resources.close)
