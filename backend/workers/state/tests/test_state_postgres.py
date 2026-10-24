"""Opt-in installed state-process acceptance on an exclusively assigned PostgreSQL DB.

Set STATE_NATIVE_DATABASE to the exact disposable TEST_DATABASE_URL database and
SPELLBOOK_TEST_STATE_COMMAND to an externally installed spellbook-state-worker.
The fixture and child each use at most four connections. No migration or public
source publication is performed; only this fixture's account is removed.
"""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from psycopg.conninfo import conninfo_to_dict
from psycopg_pool import AsyncConnectionPool
from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.mtg.categories import create_categories
from spellbook_core.mtg.categories.common import category_transaction

pytestmark = pytest.mark.skipif(
    not os.environ.get("STATE_NATIVE_DATABASE")
    or not os.environ.get("SPELLBOOK_TEST_STATE_COMMAND"),
    reason="Explicit exclusive PostgreSQL assignment and installed state command required",
)


def test_installed_process_completes_category_job_and_stops_cleanly(tmp_path: Path) -> None:
    async def scenario() -> None:
        target = os.environ["STATE_NATIVE_DATABASE"]
        dsn = os.environ["TEST_DATABASE_URL"]
        try:
            database = conninfo_to_dict(dsn).get("dbname")
        except Exception:
            raise AssertionError("Invalid protected test database configuration") from None
        assert database == target, "Database must match the explicit disposable assignment"
        assert target.startswith(("sb_py_", "spellbook_test"))
        assert os.environ.get("DATABASE_URL", dsn) == dsn
        command = Path(os.environ["SPELLBOOK_TEST_STATE_COMMAND"]).resolve(strict=True)
        repository = Path(__file__).resolve().parents[4]
        assert not command.is_relative_to(repository), "Use an external production installation"

        pool = AsyncConnectionPool(
            dsn,
            open=False,
            min_size=0,
            max_size=4,
            kwargs={"application_name": "spellbook-state-test"},
        )
        account, deck = str(uuid4()), str(uuid4())
        token = uuid4().hex + uuid4().hex[:11]
        child: asyncio.subprocess.Process | None = None
        await pool.open()
        try:
            async with category_transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute("SELECT count(*) FROM deck_whole_category_jobs")
                ).fetchone() == (0,), "Exclusive fixture requires no unrelated category jobs"
                assert await (
                    await tx.execute("SELECT count(*) FROM drizzle.__drizzle_migrations")
                ).fetchone() == (25,)
            async with category_transaction(pool) as tx:
                await tx.execute(
                    "INSERT INTO user_profiles(account_id,username) VALUES(%s,%s)",
                    (account, "state-process-" + account),
                )
                await tx.execute(
                    "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                    (hash_session_token(token), account, datetime.now(UTC) + timedelta(hours=1)),
                )
                await tx.execute(
                    "INSERT INTO decks(id,account_id,game,name) VALUES(%s::uuid,%s,'mtg',%s)",
                    (deck, account, "State process fixture"),
                )
            auth = create_session_auth(pool)
            actor = await auth.validate_session(token)
            assert actor is not None
            api = create_categories(pool, auth)
            await api.save_definition(
                actor,
                dict(
                    requestId=str(uuid4()),
                    originId=None,
                    expectedLibraryRevision="0",
                    scope="deck",
                    name="No proven lands",
                    meaning="An empty Deck matches the negated minimum",
                    priority=0,
                    displayOrder=0,
                    roles=["main"],
                    rule=dict(
                        op="not",
                        child=dict(
                            op="minimumCopies", minimum=1, predicate=dict(op="type", value="Land")
                        ),
                    ),
                    confirmRetainedRule=False,
                ),
            )
            await api.initialize_deck_categories(actor, dict(requestId=str(uuid4()), deckId=deck))
            async with category_transaction(pool, read_only=True) as tx:
                assert await (
                    await tx.execute(
                        "SELECT attempts,lease_token FROM deck_whole_category_jobs "
                        "WHERE deck_id=%s::uuid",
                        (deck,),
                    )
                ).fetchone() == (0, None)

            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"PYTHONPATH", "PYTHONHOME", "VIRTUAL_ENV"}
            }
            environment.update(
                DATABASE_URL=dsn,
                VALUE_HISTORY_ENABLED="true",
                VALUE_HISTORY_TIMEZONE="Europe/Berlin",
                COMMANDER_SPELLBOOK_ENABLED="false",
            )
            with (tmp_path / "state-worker.log").open("w") as output:
                child = await asyncio.create_subprocess_exec(
                    str(command),
                    cwd=tmp_path,
                    env=environment,
                    stdout=output,
                    stderr=asyncio.subprocess.STDOUT,
                )
                async with asyncio.timeout(15):
                    while True:
                        assert child.returncode is None, (
                            "Installed worker exited before completion"
                        )
                        async with category_transaction(pool, read_only=True) as tx:
                            job = await (
                                await tx.execute(
                                    "SELECT generation,attempts,last_error "
                                    "FROM deck_whole_category_jobs WHERE deck_id=%s::uuid",
                                    (deck,),
                                )
                            ).fetchone()
                        if job is None:
                            break
                        await asyncio.sleep(0.05)
                whole = await api.get_deck_whole_categories(actor, deck)
                assert len(whole["categories"]) == 1
                decision = whole["categories"][0]["decision"]
                assert decision is not None
                assert decision["state"] == "Automatic" and decision["truth"] == "True"
        finally:
            try:
                if child is not None:
                    if child.returncode is None:
                        child.terminate()
                    await asyncio.wait_for(child.wait(), 5)
                    assert child.returncode == 0, "Installed worker did not stop cleanly"
            finally:
                try:
                    async with category_transaction(pool) as tx:
                        await tx.execute(
                            "DELETE FROM user_profiles WHERE account_id=%s", (account,)
                        )
                finally:
                    await pool.close()

    asyncio.run(scenario())
