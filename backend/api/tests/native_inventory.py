"""Shared guarded PostgreSQL fixture for installed Python HTTP acceptance.

Core owns replay/legacy transaction cases; native_host_acceptance.py compares the
retained compiled Node artifact explicitly. No current TypeScript source is used.
"""

import importlib.util
import os
import sys
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType
from typing import cast

import pytest
from spellbook_core.auth import SessionAuth, create_session_auth
from spellbook_core.db import ConnectionPool
from spellbook_core.models import Actor
from spellbook_core.mtg.catalog import create_catalog
from spellbook_core.mtg.inventory import Inventory, create_inventory
from spellbook_core.mtg.models import CardDocument

ROOT = Path(__file__).resolve().parents[3]
NATIVE = pytest.mark.skipif(
    not os.environ.get("P02B_INVENTORY_NATIVE_DATABASE"),
    reason="Requires exclusive api_python lease",
)


def _core_native_helpers() -> ModuleType:
    # Reuse Core-owned fixture support without adding it to the shipped package.
    name = "p02b_inventory_native_helpers"
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(
        name, ROOT / "backend/core/tests/test_inventory.py"
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


@dataclass(frozen=True)
class NativeInventory:
    pool: ConnectionPool
    auth: SessionAuth
    inventory: Inventory
    actor: Actor
    account_id: str
    token: str
    card: CardDocument


@asynccontextmanager
async def native_fixture() -> AsyncIterator[NativeInventory]:
    helpers = _core_native_helpers()
    async with (
        helpers.native_pool() as pool,
        helpers.native_catalog(pool),
        helpers.native_account(pool) as (account, token),
    ):
        typed_pool = cast(ConnectionPool, pool)
        auth = create_session_auth(typed_pool)
        actor = await auth.validate_session(token)
        assert actor
        yield NativeInventory(
            typed_pool,
            auth,
            create_inventory(typed_pool, create_catalog(typed_pool), auth),
            actor,
            account,
            token,
            cast(CardDocument, helpers.CARD),
        )
