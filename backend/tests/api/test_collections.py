import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock
from uuid import uuid4


@pytest.mark.asyncio
async def test_get_my_collection(
    async_client: AsyncClient, mock_db_session, test_token
):
    headers = {"Authorization": f"Bearer {test_token}"}

    # Mock get_or_create_default_collection
    mock_collection = MagicMock()
    mock_collection.id = uuid4()
    mock_collection.name = "My Collection"

    # Mock the execute for finding the collection, and then for cards
    # This is a bit complex for a generic AsyncMock, so let's use patch
    # on get_or_create_default_collection.

    with patch(
        "app.api.v1.collections.get_or_create_default_collection",
        return_value=mock_collection,
    ):
        # We also need to mock the execute that gets the collection cards
        mock_cards_result = MagicMock()
        mock_cards_result.scalars().all.return_value = []
        mock_db_session.execute.return_value = mock_cards_result

        response = await async_client.get("/api/v1/collections/mine", headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert len(data["items"]) == 0


@pytest.mark.asyncio
async def test_get_my_collection_stats(
    async_client: AsyncClient, mock_db_session, test_token
):
    headers = {"Authorization": f"Bearer {test_token}"}

    mock_collection = MagicMock()
    mock_collection.id = uuid4()

    with patch(
        "app.api.v1.collections.get_or_create_default_collection",
        return_value=mock_collection,
    ):
        # Mock some cards in the collection to test stats logic
        mock_card1 = MagicMock()
        mock_card1.quantity = 2
        mock_card1.card.prices = {"usd": "1.50"}
        mock_card1.card.extra_data = {"set_info": {"code": "LEB"}}

        mock_card2 = MagicMock()
        mock_card2.quantity = 1
        mock_card2.card.prices = {"usd": "5.00"}
        mock_card2.card.extra_data = {"set_info": {"code": "LEA"}}

        mock_cards_result = MagicMock()
        mock_cards_result.scalars().all.return_value = [mock_card1, mock_card2]
        mock_db_session.execute.return_value = mock_cards_result

        response = await async_client.get(
            "/api/v1/collections/mine/stats", headers=headers
        )

    assert response.status_code == 200
    data = response.json()
    assert data["total_cards"] == 3
    assert data["unique_cards"] == 2
    assert data["total_value"] == 8.00  # (2 * 1.50) + (1 * 5.00)
    assert data["sets_collected"] == 2
