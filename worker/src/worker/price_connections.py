"""Owned PostgreSQL connection and I/O deadlines for public price publication."""

import ipaddress
import json
import os
import subprocess
import sys
import time

import psycopg
from psycopg import generators, waiting
from psycopg.conninfo import conninfo_to_dict, make_conninfo

_RESOLVER_CODE = (
    "import json,socket,sys; "
    "addresses=socket.getaddrinfo(sys.stdin.read(),None,type=socket.SOCK_STREAM); "
    "json.dump(list(dict.fromkeys(row[4][0] for row in addresses)),sys.stdout)"
)


def _resolve_host(host, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise psycopg.OperationalError("Optional hostname resolution deadline exceeded")
    process = subprocess.Popen(
        [sys.executable, "-c", _RESOLVER_CODE],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    try:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired(process.args, 0)
        output, _ = process.communicate(input=host, timeout=remaining)
    except BaseException as cause:
        process.kill()
        process.communicate()
        if isinstance(cause, subprocess.TimeoutExpired):
            raise psycopg.OperationalError(
                "Optional hostname resolution deadline exceeded"
            ) from None
        raise
    if process.returncode != 0:
        raise psycopg.OperationalError("Optional hostname resolution failed")
    return json.loads(output)


def _resolved_conninfo(database_url, deadline):
    options = conninfo_to_dict(database_url)
    host_value = options.get("host") or os.environ.get("PGHOST", "")
    address_value = options.get("hostaddr") or os.environ.get("PGHOSTADDR", "")
    hosts = host_value.split(",")
    supplied_addresses = address_value.split(",") if address_value else [""] * len(hosts)
    if not host_value:
        hosts = [""] * len(supplied_addresses)
    ports = (options.get("port") or os.environ.get("PGPORT", "")).split(",")
    if len(supplied_addresses) != len(hosts) or len(ports) not in (1, len(hosts)):
        raise psycopg.OperationalError("Invalid optional database host/port configuration")
    resolved_hosts, addresses, resolved_ports = [], [], []
    for index, host in enumerate(hosts):
        port = ports[0] if len(ports) == 1 else ports[index]
        address = supplied_addresses[index]
        if address:
            try:
                ipaddress.ip_address(address)
            except ValueError:
                raise psycopg.OperationalError("Invalid optional database host address") from None
            candidates = [address]
        elif not host or host.startswith(("/", "@")):
            candidates = [""]
        else:
            try:
                ipaddress.ip_address(host)
                candidates = [host]
            except ValueError:
                try:
                    candidates = _resolve_host(host, deadline)
                except psycopg.OperationalError:
                    if time.monotonic() >= deadline:
                        raise
                    # libpq tries later hosts after a failed lookup, but never retries DNS here.
                    continue
        for address in candidates:
            resolved_hosts.append(host)
            addresses.append(address)
            resolved_ports.append(port)
    if not resolved_hosts:
        raise psycopg.OperationalError("Optional hostname resolution failed")
    return make_conninfo(
        database_url,
        host=",".join(resolved_hosts),
        hostaddr=",".join(addresses),
        port=",".join(resolved_ports),
    )


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
    setup_deadline = min(deadline, time.monotonic() + connect_seconds)
    remaining = setup_deadline - time.monotonic()
    if remaining <= 0:
        raise ValueError("Optional database deadline exceeded")
    database_url = _resolved_conninfo(database_url, setup_deadline)
    remaining = setup_deadline - time.monotonic()
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
