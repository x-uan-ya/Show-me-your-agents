"""Pytest fixtures."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.services.auth.dependencies import get_current_user
from app.services.ai.factory import get_ai_provider
from app.services.ai.mock_provider import MockAIProvider


@pytest.fixture(autouse=True)
def use_mock_ai_provider():
    """Never spend gateway credit or require credentials in automated tests."""
    app.dependency_overrides[get_ai_provider] = lambda: MockAIProvider()
    # Existing business tests predate authentication. Run them as an admin so
    # they continue to exercise their original behaviour; dedicated auth tests
    # remove this override and exercise real cookie authentication.
    admin = User(
        id=999_999,
        email="test-admin@example.test",
        password_hash="not-returned",
        display_name="Test Admin",
        role="admin",
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    app.dependency_overrides[get_current_user] = lambda: admin
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
