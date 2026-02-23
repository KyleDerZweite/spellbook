import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
async def test_search_cards_empty(async_client: AsyncClient, mock_db_session):
    # Mock index search count
    mock_result = MagicMock()
    mock_result.scalar.return_value = 0
    mock_db_session.execute.return_value = mock_result

    with patch(
        "app.api.v1.cards.card_service.search_cards_with_details", return_value=[]
    ):
        response = await async_client.get("/api/v1/cards/search?q=missing")

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 0
    assert data["meta"]["total"] == 0


@pytest.mark.asyncio
async def test_search_cards_found(async_client: AsyncClient, mock_db_session):
    # Mock index search count
    mock_result = MagicMock()
    mock_result.scalar.return_value = 1
    mock_db_session.execute.return_value = mock_result

    # Mock the returned card from the service
    mock_card = {
        "id": "12345678-1234-5678-1234-567812345678",
        "scryfall_id": "12345678-1234-5678-1234-567812345678",
        "oracle_id": "12345678-1234-5678-1234-567812345678",
        "name": "Lightning Bolt",
        "mana_cost": "{R}",
        "type_line": "Instant",
        "oracle_text": "Deal 3 damage",
        "colors": "R",
        "color_identity": "R",
        "rarity": "common",
        "set": {
            "id": "12345678-1234-5678-1234-567812345678",
            "code": "LEB",
            "name": "Limited Edition Beta",
            "release_date": "1993-10-01",
        },
        "image_uris": {},
        "prices": {},
        "legalities": {},
        "created_at": "2023-01-01T00:00:00Z",
        "updated_at": "2023-01-01T00:00:00Z",
    }

    with patch(
        "app.api.v1.cards.card_service.search_cards_with_details",
        return_value=[mock_card],
    ):
        response = await async_client.get("/api/v1/cards/search?q=lightning")

    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["name"] == "Lightning Bolt"
    assert data["meta"]["total"] == 1
