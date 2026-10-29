"""One process owns private history and durable Category jobs, with graceful stop."""

import argparse
import asyncio
import logging
import os
import signal
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Never
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from psycopg import AsyncConnection
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import AsyncConnectionPool
from spellbook_core.auth import create_session_auth
from spellbook_core.mtg.categories import configure_combo_adapter
from spellbook_core.mtg.inventory_value import create_inventory_values
from spellbook_core.mtg.valuation import create_valuation
from spellbook_core.validation import js_trim

from spellbook_state.categories import WholeDeckCategoryRunner
from spellbook_state.value_history import create_value_history_runner


@dataclass(frozen=True)
class Configuration:
    database_url: str = field(repr=False)
    value_history_enabled: bool = True
    value_history_timezone: str = "Europe/Berlin"
    commander_spellbook_enabled: bool = False
    demo_mode: bool = False

    def __post_init__(self) -> None:
        try:
            if not self.database_url.strip():
                raise ValueError()
            conninfo_to_dict(self.database_url)
        except Exception:
            raise ValueError("DATABASE_URL must be a valid PostgreSQL connection string") from None
        timezone = js_trim(self.value_history_timezone) or "Europe/Berlin"
        try:
            ZoneInfo(timezone)
        except ZoneInfoNotFoundError, ValueError:
            raise ValueError("VALUE_HISTORY_TIMEZONE must be a valid IANA timezone") from None
        object.__setattr__(self, "value_history_timezone", timezone)

    @classmethod
    def from_environment(cls, env: Mapping[str, str]) -> Configuration:
        enabled = env.get("VALUE_HISTORY_ENABLED", "true")
        combo = env.get("COMMANDER_SPELLBOOK_ENABLED", "false")
        if enabled not in {"true", "false"}:
            raise ValueError("VALUE_HISTORY_ENABLED must be true or false")
        if combo not in {"true", "false"}:
            raise ValueError("COMMANDER_SPELLBOOK_ENABLED must be true or false")
        demo = env.get("DEMO_MODE", "false")
        if demo not in {"true", "false"}:
            raise ValueError("DEMO_MODE must be true or false")
        return cls(
            env.get("DATABASE_URL", ""),
            enabled == "true",
            env.get("VALUE_HISTORY_TIMEZONE", "Europe/Berlin"),
            combo == "true",
            demo == "true",
        )


class StateResources:
    def __init__(self, configuration: Configuration):
        self.pool: AsyncConnectionPool[AsyncConnection[tuple[object, ...]]] = AsyncConnectionPool(
            configuration.database_url,
            open=False,
            min_size=0,
            max_size=4,
            max_waiting=16,
            timeout=2.0,
            kwargs={"connect_timeout": 2, "application_name": "spellbook-state-worker"},
        )
        configure_combo_adapter(self.pool, configuration.commander_spellbook_enabled)
        self.auth = create_session_auth(self.pool)
        self.valuation = create_valuation(
            self.pool,
            self.auth,
            timezone=configuration.value_history_timezone,
            demo_mode=configuration.demo_mode,
        )
        self.values = create_inventory_values(
            self.pool, self.valuation, timezone=configuration.value_history_timezone
        )
        self.history = create_value_history_runner(self.pool, self.values)
        self.categories = WholeDeckCategoryRunner(self.pool)
        self._history_enabled = configuration.value_history_enabled
        self._started = False
        self._closing = False
        self._close_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._closing:
            raise RuntimeError("State resources are closed")
        if self._started:
            return
        await self.pool.open()
        async with self.pool.connection(timeout=2.0):
            pass
        self._started = True
        self.categories.start()
        if self._history_enabled:
            self.history.start()

    async def _close(self) -> None:
        self._closing = True
        try:
            # Stop both schedulers and join all transaction cleanup before pool close.
            results = await asyncio.gather(
                self.categories.close(), self.history.close(), return_exceptions=True
            )
            for result in results:
                if isinstance(result, BaseException):
                    raise result
        finally:
            await self.pool.close()

    async def close(self) -> None:
        self._closing = True
        if self._close_task is None:
            self._close_task = asyncio.create_task(self._close(), name="state-resources-close")
            # Retrieve any failure even if the caller is cancelled while cleanup continues.
            self._close_task.add_done_callback(
                lambda task: None if task.cancelled() else task.exception()
            )
        await asyncio.shield(self._close_task)


async def serve(configuration: Configuration, stop: asyncio.Event) -> None:
    resources = StateResources(configuration)
    try:
        await resources.start()
        logging.info("Spellbook state worker started")
        await stop.wait()
    finally:
        await resources.close()


async def _run(configuration: Configuration) -> None:
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for signum in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(signum, stop.set)
    try:
        await serve(configuration, stop)
    finally:
        for signum in (signal.SIGINT, signal.SIGTERM):
            loop.remove_signal_handler(signum)


class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> Never:
        self.print_usage(sys.stderr)
        self.exit(2, "Invalid state worker arguments; use --help.\n")


def main(argv: Sequence[str] | None = None) -> int:
    parser = Parser(description="Run ValueHistory and WholeDeckCategory schedulers.")
    parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO)
    try:
        configuration = Configuration.from_environment(os.environ)
    except ValueError as cause:
        print(str(cause), file=sys.stderr)
        return 2
    try:
        asyncio.run(_run(configuration))
    except KeyboardInterrupt:
        return 130
    except Exception:
        logging.error("State worker failed; inspect its configuration and database availability.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
