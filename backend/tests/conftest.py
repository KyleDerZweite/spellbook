import pytest
import pytest_asyncio
from typing import AsyncGenerator
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock

from app.main import app
from app.database import get_async_session
from app.models.user import User
import uuid

from app.core.deps import get_current_user


# Create a generic mock db session
@pytest.fixture
def mock_db_session():
    session = AsyncMock()
    # Setup some basic returns for execute
    session.execute = AsyncMock()

    async def mock_refresh(instance):
        if not hasattr(instance, "id") or not instance.id:
            instance.id = uuid.uuid4()
        if not hasattr(instance, "created_at") or not instance.created_at:
            from datetime import datetime

            instance.created_at = datetime.utcnow()
        instance.is_admin = False
        instance.is_active = True
        if not hasattr(instance, "preferences") or not instance.preferences:
            instance.preferences = {}
        return instance

    session.refresh = mock_refresh
    return session


@pytest.fixture
def client(mock_db_session, test_user):
    async def override_get_db():
        yield mock_db_session

    async def override_get_current_user():
        return test_user

    app.dependency_overrides[get_async_session] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def async_client(mock_db_session, test_user):
    async def override_get_db():
        yield mock_db_session

    async def override_get_current_user():
        return test_user

    app.dependency_overrides[get_async_session] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def test_user():
    return User(
        id=uuid.uuid4(),
        email="test@example.com",
        username="testuser",
        is_active=True,
        is_admin=False,
    )


@pytest.fixture
def test_token(test_user):
    return "dummy-token-not-used"
