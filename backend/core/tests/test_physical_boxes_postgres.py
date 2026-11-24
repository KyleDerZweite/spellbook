"""Real registry persistence under the shared api_python database lease."""

import asyncio
from uuid import UUID, uuid4

import pytest
from test_inventory import native_account, native_pool
from test_inventory_groups_postgres import native_database_guard as native_database_guard

from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.db import transaction
from spellbook_core.errors import ActorError, RequestConflictError
from spellbook_core.mtg.physical_boxes import PhysicalBoxes


def test_registry_lifecycle_is_account_scoped() -> None:
    async def scenario() -> None:
        async with (
            native_pool() as pool,
            native_account(pool) as (account, token),
            native_account(pool) as (_, other_token),
        ):
            auth = create_session_auth(pool)
            owner = await auth.validate_session(token)
            other = await auth.validate_session(other_token)
            assert owner is not None and other is not None
            boxes = PhysicalBoxes(pool, auth)
            assert await boxes.list(owner) == []
            request_id = str(uuid4())
            box = await boxes.create(owner, " Blue ", request_id)
            assert await boxes.create(owner, "Blue", request_id) == box
            with pytest.raises(RequestConflictError):
                await boxes.create(owner, "New", request_id)
            box_id = box["id"]
            assert str(UUID(box_id)) == box_id
            assert box == {"id": box_id, "name": "Blue", "condition": None}
            assert await boxes.list(other) == []
            assert await boxes.get(other, box_id) is None
            assert await boxes.update(other, box_id, {"name": "Foreign"}) is None
            condition = [{"field": "printedColor", "oneOf": ["blue"]}]
            assert await boxes.update(owner, box_id, {"condition": condition}) == {
                **box,
                "condition": condition,
            }
            assert await boxes.update(owner, box_id, {"name": "Azure"}) == {
                **box,
                "name": "Azure",
                "condition": condition,
            }
            assert await boxes.update(owner, box_id, {"condition": None}) == {
                **box,
                "name": "Azure",
            }
            assert await boxes.create(owner, "Blue", request_id) == box
            assert await boxes.list(owner) == [{**box, "name": "Azure"}]
            async with transaction(pool) as tx:
                await tx.execute(
                    "UPDATE auth_sessions SET device_id=%s, last_seen_at=now() "
                    "WHERE token_hash=%s AND account_id=%s",
                    (uuid4(), hash_session_token(token), account),
                )
            linked = await auth.validate_session(token)
            assert linked is not None
            assert await boxes.get(linked, box_id) == {**box, "name": "Azure"}
            with pytest.raises(ActorError):
                await boxes.list(linked)
            with pytest.raises(ActorError):
                await boxes.update(linked, box_id, {"name": "Device"})

    asyncio.run(scenario())
