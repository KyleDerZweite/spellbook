"""Explicit request-pool, listener, stream and password-executor ownership."""

import asyncio
import os
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI
from psycopg import AsyncConnection
from psycopg_pool import AsyncConnectionPool
from spellbook_core.auth import create_session_auth
from spellbook_core.catalog import create_catalog
from spellbook_core.inventory import create_inventory
from spellbook_core.passwords import create_password_verifier
from spellbook_core.saved_state import create_saved_state

from spellbook_api.http.admission import RequestAdmission
from spellbook_api.http.application import create_http_application
from spellbook_api.http.routes_saved_state import create_saved_state_routes
from spellbook_api.http.types import ApplicationLifetime, Configuration
from spellbook_api.listener import SavedStateListener
from spellbook_api.verification import (
    VerificationPlan,
    VerificationReport,
    VerificationRun,
    start_verification,
)


async def _close_discovery() -> None:
    """Discovery owns no external resources or streams."""


class ApplicationResources:
    def __init__(
        self,
        configuration: Configuration,
        plan: VerificationPlan | None,
        sink: Callable[[VerificationReport], None] | None,
    ) -> None:
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
        self.admission = RequestAdmission()
        self.executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="spellbook-scrypt")
        self.passwords = create_password_verifier(self.executor)
        self.listener = SavedStateListener(configuration.database_url)
        self.auth = create_session_auth(self.pool)
        self.catalog = create_catalog(self.pool)
        self.inventory = create_inventory(self.pool, self.catalog, self.auth)
        self.saved_state = create_saved_state(
            self.auth,
            ensure_listener=self.listener.ensure_listener,
            request_listener_recovery=self.listener.request_recovery,
        )
        self.saved_routes = create_saved_state_routes(
            self.auth, self.saved_state, configuration.public_origin
        )
        self._plan = plan
        self._sink = sink
        self._verification: VerificationRun | None = None
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
        if self._plan is not None:
            assert self._sink is not None
            self._verification = start_verification(self.passwords, self._plan, self._sink)

    async def close_streams(self) -> None:
        self._closing = True
        self.admission.close_admission()
        self.saved_state.close_admission()
        if self._verification is not None:
            self._verification.stop_admission()
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
                        if self._verification is not None:
                            await self._verification.settle()
                    finally:
                        try:
                            await self.passwords.settle()
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


def create_application(
    configuration: Configuration,
    *,
    verification_plan: VerificationPlan | None = None,
    verification_sink: Callable[[VerificationReport], None] | None = None,
) -> ApplicationLifetime:
    if (verification_plan is None) != (verification_sink is None):
        raise ValueError("Private verification requires both plan and sink")
    if configuration.database_url is None:
        if verification_plan is not None:
            raise ValueError("Private verification requires the actual database-backed host")
        return ApplicationLifetime(
            create_http_application(configuration), _close_discovery, _close_discovery
        )
    resources = ApplicationResources(configuration, verification_plan, verification_sink)
    try:
        http = create_http_application(
            configuration,
            auth=resources.auth,
            catalog=resources.catalog,
            inventory=resources.inventory,
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
