import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(async_client: AsyncClient, mock_db_session):
    # Mocking database check and startup status could be tricky since it calls them directly,
    # but the test app will just run it. We might need to mock check_database_health.

    # We can just test that it returns a 200 or at least responds in test mode
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "version" in data
