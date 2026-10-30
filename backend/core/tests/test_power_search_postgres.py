"""Real SQL on an explicitly assigned disposable database, using existing fixtures."""

import asyncio
import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from test_catalog_valuation_postgres import native_fixture

from spellbook_core.auth import create_session_auth, hash_session_token
from spellbook_core.db import transaction
from spellbook_core.errors import ActorError
from spellbook_core.models import Actor
from spellbook_core.mtg.power_search import create_power_search

pytestmark = pytest.mark.skipif(
    not os.environ.get("SPELLBOOK_DOMAIN_TEST_DATABASE"), reason="Requires disposable PG"
)


def test_complete_independent_sources_and_authority() -> None:
    async def scenario() -> None:
        async with native_fixture() as f:
            auth = create_session_auth(f.pool)
            actor = await auth.validate_session(f.token)
            assert actor
            search = create_power_search(f.pool, auth)
            token = uuid4().hex + uuid4().hex[:11]
            async with transaction(f.pool) as tx:
                await tx.execute(
                    "INSERT INTO auth_sessions(token_hash,account_id,expires_at) VALUES(%s,%s,%s)",
                    (
                        hash_session_token(token),
                        f.other_account,
                        datetime.now(UTC) + timedelta(hours=1),
                    ),
                )
                for name in ("First Context", "Second Context"):
                    deck = str(uuid4())
                    await tx.execute(
                        "INSERT INTO decks(id,account_id,game,name) VALUES(%s,%s,'mtg',%s)",
                        (deck, f.account, name),
                    )
                    for role in ("main", "sideboard"):
                        await tx.execute(
                            "INSERT INTO deck_cards(id,deck_id,account_id,game,catalog_card_id,"
                            "canonical_card_id,name,set_code,image_uri,quantity,role) "
                            "VALUES(%s,%s,%s,'mtg',%s,%s,'Aether Test','tst','',2,%s)",
                            (uuid4(), deck, f.account, f.printing, f.oracle, role),
                        )
                # The owned identity is deliberately ranked below five public exact-prefix hits.
                await tx.execute(
                    "INSERT INTO catalog_printings SELECT generation_id,gen_random_uuid(),"
                    "gen_random_uuid(),'Aether A'||n,'aether a'||n,'','en',set_code,"
                    "collector_number,rarity,cmc,colors,card_types,legalities,"
                    "'aether a'||n,search_text,document FROM catalog_printings "
                    "CROSS JOIN generate_series(1,6) n WHERE id=%s AND generation_id=%s",
                    (f.printing, f.generation),
                )
            guest = await search.search("Aether Test")
            assert guest["accountId"] is None and guest["inventory"] == guest["decks"] == []
            assert guest["cards"][0]["canonicalCardId"] == f.oracle
            assert len({c["canonicalCardId"] for c in guest["cards"]}) == len(guest["cards"])
            exact = await search.search("Aether Test", actor)
            assert exact["cards"][0]["canonicalCardId"] == f.oracle
            assert exact["inventory"][0]["canonicalCardId"] == f.oracle
            assert len(exact["decks"]) == 2
            result = await search.search("Aether", actor)
            assert result["generationId"] == f.generation and len(result["cards"]) == 5
            assert f.oracle not in [c["canonicalCardId"] for c in result["cards"]]
            assert result["inventory"] == [
                dict(kind="inventory", canonicalCardId=f.oracle, name="Aether Test", quantity=5)
            ]
            assert len(result["decks"]) == 2
            assert all(d["quantity"] == 4 for d in result["decks"])
            assert len((await search.search("Context", actor))["decks"]) == 2
            other = await auth.validate_session(token)
            assert other
            isolated = await search.search("Aether", other)
            assert isolated["inventory"] == isolated["decks"] == []
            with pytest.raises(ActorError):
                await search.search("Aether", Actor(f.account, "fake", "", "", ""))
            for query in ("123", "' | ! : &", "x'); DROP TABLE decks; --", "AetherTest"):
                await search.search(query, actor)
            async with transaction(f.pool) as tx:
                await tx.execute("UPDATE catalog_state SET active_generation=NULL WHERE id=1")
            absent = await search.search("Aether Test", actor)
            assert absent["generationId"] is None and absent["cards"] == []
            assert absent["inventory"] and len(absent["decks"]) == 2
            async with transaction(f.pool) as tx:
                await tx.execute("DELETE FROM auth_sessions WHERE account_id=%s", (f.account,))
            with pytest.raises(ActorError):
                await search.search("Aether", actor)

    asyncio.run(scenario())
