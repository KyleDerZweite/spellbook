import socket
import threading
import time
from contextlib import contextmanager

import psycopg
import pytest

from worker.price_connections import connect


@contextmanager
def stalled_handshake():
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    listener.listen()
    listener.settimeout(2)
    closed = threading.Event()

    def serve():
        with listener.accept()[0] as client:
            client.settimeout(2)
            while client.recv(4096):
                pass
            closed.set()

    thread = threading.Thread(target=serve)
    thread.start()
    try:
        yield (
            "postgresql://fixture@127.0.0.1:" + str(listener.getsockname()[1]) + "/fixture",
            closed,
        )
    finally:
        listener.close()
        thread.join(3)
        assert not thread.is_alive()


def test_connection_setup_deadline_closes_its_actual_stalled_socket():
    with stalled_handshake() as (url, closed):
        start = time.monotonic()
        with pytest.raises(psycopg.OperationalError):
            connect(url, start + 0.1, 10)
        assert time.monotonic() - start < 0.7
        assert closed.wait(0.5)


def test_expired_budget_never_starts_a_connection(monkeypatch):
    def unexpected(_url):
        pytest.fail("Expired import must not start connection setup")

    monkeypatch.setattr("worker.price_connections.generators.connect", unexpected)
    with pytest.raises(ValueError, match="deadline"):
        connect("fixture", time.monotonic() - 1, 10)


def test_failure_recording_has_a_separate_finite_connection_budget():
    from worker.optional_publication import OptionalPricePublisher
    from worker.price_artifacts import PriceLimits

    with stalled_handshake() as (url, closed):
        start = time.monotonic()
        publisher = OptionalPricePublisher(url, PriceLimits(connect_seconds=1))
        with pytest.raises(psycopg.OperationalError):
            publisher.record_failure("Cardmarket", ValueError("Original source failure"))
        assert time.monotonic() - start < 1.7
        assert closed.wait(0.5)


def test_actual_postgres_io_deadline_closes_transport():
    import os

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for actual PostgreSQL I/O")
    start = time.monotonic()
    connection = connect(url, start + 0.2, 10)
    with pytest.raises(psycopg.OperationalError), connection:
        connection.execute("SELECT pg_sleep(2)")
    assert time.monotonic() - start < 0.8
    assert connection.closed


def test_actual_postgres_failure_status_query_is_bounded_and_rolls_back():
    import os
    from uuid import uuid4

    from psycopg import sql
    from psycopg.conninfo import make_conninfo

    from worker.optional_publication import OptionalPricePublisher
    from worker.price_artifacts import PriceLimits

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for actual failure-status I/O")
    schema = "failure_deadline_" + uuid4().hex
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(schema)))
        scoped = make_conninfo(url, options=f"-csearch_path={schema},public")
        try:
            with psycopg.connect(scoped) as conn:
                conn.execute(
                    "CREATE TABLE optional_price_state(source text PRIMARY KEY,"
                    "refresh_status jsonb)"
                )
                conn.execute(
                    "INSERT INTO optional_price_state VALUES"
                    "('Cardmarket','{\"kind\":\"Succeeded\"}')"
                )
                conn.execute(
                    "CREATE FUNCTION stall_status() RETURNS trigger LANGUAGE plpgsql AS $$ "
                    "BEGIN PERFORM pg_sleep(2); RETURN NEW; END $$"
                )
                conn.execute(
                    "CREATE TRIGGER stall_status BEFORE UPDATE ON optional_price_state "
                    "FOR EACH ROW EXECUTE FUNCTION stall_status()"
                )
            start = time.monotonic()
            with pytest.raises(psycopg.OperationalError):
                OptionalPricePublisher(scoped, PriceLimits(connect_seconds=1)).record_failure(
                    "Cardmarket", ValueError("Fixture original")
                )
            assert time.monotonic() - start < 1.7
            with psycopg.connect(scoped) as conn:
                assert conn.execute(
                    "SELECT refresh_status->>'kind' FROM optional_price_state"
                ).fetchone() == ("Succeeded",)
        finally:
            admin.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


@pytest.mark.parametrize(
    "url",
    ["host=localhost dbname=fixture", "host=localhost,backup hostaddr=,127.0.0.1 dbname=fixture"],
)
def test_hostname_setup_deadline_terminates_its_owned_resolution_process(monkeypatch, url):
    import subprocess

    processes = []
    native_popen = subprocess.Popen

    def stalled_resolver(args, **kwargs):
        # Only the read-only resolver child is stalled; no database writer is started.
        args = [*args[:-1], "import time; time.sleep(2)"]
        process = native_popen(args, **kwargs)
        processes.append(process)
        return process

    def unexpected_connection(_url):
        pytest.fail("Expired hostname setup must not start PostgreSQL connection")

    monkeypatch.setattr(subprocess, "Popen", stalled_resolver)
    monkeypatch.setattr("worker.price_connections.generators.connect", unexpected_connection)
    started = time.monotonic()
    with pytest.raises(psycopg.OperationalError, match="resolution"):
        connect(url, started + 0.1, 10)
    assert time.monotonic() - started < 0.7
    assert len(processes) == 1 and processes[0].poll() is not None


def test_actual_postgres_hostname_connection_preserves_host_and_uses_resolved_addresses():
    import os

    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for hostname PostgreSQL setup")
    options = conninfo_to_dict(url)
    if options.get("host") not in ("localhost", "127.0.0.1", "::1"):
        pytest.skip("Own PostgreSQL hostname fixture needs loopback")
    with connect(
        make_conninfo(url, host="localhost", hostaddr=""), time.monotonic() + 5, 5
    ) as conn:
        assert conn.info.host == "localhost"
        assert conn.info.hostaddr in ("127.0.0.1", "::1")
        assert conn.execute("SELECT current_database()").fetchone() == (options["dbname"],)


def test_hostname_resolution_and_stalled_handshake_share_one_setup_budget(monkeypatch):
    import subprocess

    from psycopg.conninfo import make_conninfo

    native_popen = subprocess.Popen

    def delayed_resolver(args, **kwargs):
        args = [*args[:-1], "import time; time.sleep(0.1); " + args[-1]]
        return native_popen(args, **kwargs)

    monkeypatch.setattr(subprocess, "Popen", delayed_resolver)
    with stalled_handshake() as (url, closed):
        started = time.monotonic()
        with pytest.raises(psycopg.OperationalError):
            connect(make_conninfo(url, host="localhost"), started + 10, 0.2)
        assert time.monotonic() - started < 0.6
        assert closed.wait(0.5)


def test_publication_setup_error_survives_unavailable_failure_status(monkeypatch):
    from types import SimpleNamespace

    from worker.optional_publication import OptionalPricePublisher
    from worker.price_artifacts import PriceLimits

    with stalled_handshake() as (url, closed):
        publisher = OptionalPricePublisher(url)

        def unavailable_status(*_args):
            raise OSError("Owned resolver process setup unavailable")

        monkeypatch.setattr(publisher, "record_failure", unavailable_status)
        adapter = SimpleNamespace(limits=PriceLimits(), import_deadline=time.monotonic() + 0.1)
        with pytest.raises(psycopg.OperationalError):
            publisher.publish_cardmarket(adapter)
        assert closed.wait(0.5)


@pytest.mark.parametrize("from_environment", [False, True])
def test_partial_address_list_resolves_only_missing_positions(monkeypatch, from_environment):
    from psycopg.conninfo import conninfo_to_dict

    from worker.price_connections import _resolved_conninfo

    calls = []

    def resolve(host, deadline):
        calls.append((host, deadline))
        return ["127.0.0.2", "::1"]

    monkeypatch.setattr("worker.price_connections._resolve_host", resolve)
    url = "host=postgres,backup port=5432,5433 dbname=fixture"
    if from_environment:
        monkeypatch.setenv("PGHOSTADDR", ",127.0.0.1")
    else:
        url += " hostaddr=,127.0.0.1"
    deadline = time.monotonic() + 5
    options = conninfo_to_dict(_resolved_conninfo(url, deadline))
    assert calls == [("postgres", deadline)]
    assert options["host"] == "postgres,postgres,backup"
    assert options["hostaddr"] == "127.0.0.2,::1,127.0.0.1"
    assert options["port"] == "5432,5432,5433"


def test_abstract_unix_socket_does_not_enter_dns(monkeypatch):
    from psycopg.conninfo import conninfo_to_dict

    from worker.price_connections import _resolved_conninfo

    def unexpected(*_args):
        pytest.fail("Abstract Unix socket must not enter DNS")

    monkeypatch.setattr("worker.price_connections._resolve_host", unexpected)
    options = conninfo_to_dict(
        _resolved_conninfo("host=@optional-fixture dbname=fixture", time.monotonic() + 5)
    )
    assert options["host"] == "@optional-fixture"
    assert options.get("hostaddr", "") == ""


def test_actual_postgres_failed_hostname_preserves_numeric_fallback(monkeypatch):
    import os

    from psycopg.conninfo import conninfo_to_dict, make_conninfo

    url = os.environ.get("WORKER_TEST_DATABASE_URL")
    if not url:
        pytest.skip("Set WORKER_TEST_DATABASE_URL for actual multihost PostgreSQL setup")
    options = conninfo_to_dict(url)
    if options.get("host") not in ("localhost", "127.0.0.1", "::1"):
        pytest.skip("Own multihost PostgreSQL fixture needs loopback")

    def failed(host, _deadline):
        assert host == "missing.invalid"
        raise psycopg.OperationalError("Optional hostname resolution failed")

    monkeypatch.setattr("worker.price_connections._resolve_host", failed)
    with connect(
        make_conninfo(url, host="missing.invalid,127.0.0.1", hostaddr=""),
        time.monotonic() + 5,
        5,
    ) as conn:
        assert conn.info.host == "127.0.0.1"
        assert conn.execute("SELECT current_database()").fetchone() == (options["dbname"],)


def test_address_only_multihost_list_preserves_numeric_candidates(monkeypatch):
    from psycopg.conninfo import conninfo_to_dict

    from worker.price_connections import _resolved_conninfo

    def unexpected(*_args):
        pytest.fail("Explicit numeric addresses must not enter DNS")

    monkeypatch.setattr("worker.price_connections._resolve_host", unexpected)
    options = conninfo_to_dict(
        _resolved_conninfo(
            "hostaddr=127.0.0.1,::1 port=5432,5433 dbname=fixture", time.monotonic() + 5
        )
    )
    assert options["hostaddr"] == "127.0.0.1,::1"
    assert options["port"] == "5432,5433"
