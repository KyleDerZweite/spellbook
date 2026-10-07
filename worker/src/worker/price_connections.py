"""Owned PostgreSQL connection and I/O deadlines for public price publication."""

import time

import psycopg
from psycopg import generators, waiting


class DeadlineConnection(psycopg.Connection):
    def __init__(self, pgconn, deadline):
        super().__init__(pgconn)
        self.deadline = deadline

    def wait(self, gen, interval=0.1, timeout=None):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            self.pgconn.finish()
            raise ValueError("Optional database deadline exceeded")
        try:
            return super().wait(
                gen,
                interval=interval,
                timeout=min(remaining, timeout) if timeout is not None else remaining,
            )
        except psycopg.OperationalError:
            # Close the owned transport, including an unfinished transaction, before returning.
            self.pgconn.finish()
            raise


def connect(database_url, deadline, connect_seconds):
    remaining = min(deadline - time.monotonic(), connect_seconds)
    if remaining <= 0:
        raise ValueError("Optional database deadline exceeded")
    generator = generators.connect(database_url)
    try:
        pgconn = waiting.wait_conn(generator, timeout=remaining)
    except BaseException:
        generator.close()
        raise
    if time.monotonic() >= deadline:
        pgconn.finish()
        raise ValueError("Optional database deadline exceeded")
    return DeadlineConnection(pgconn, deadline)
