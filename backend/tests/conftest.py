"""Pytest fixtures."""

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.user import User
from app.models.workspace import Workspace
from app.services.auth.dependencies import AccessContext, get_current_access, get_current_user
from app.services.ai.factory import get_ai_provider
from app.services.ai.mock_provider import MockAIProvider
from app.services.rate_limit import rate_limiter


@pytest.fixture(autouse=True)
def use_mock_ai_provider():
    """Never spend gateway credit or require credentials in automated tests."""
    rate_limiter.reset()
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
    # Existing business tests intentionally exercise their original endpoints
    # without constructing tenant fixtures. A transient system workspace with
    # id=None matches their legacy clients; dedicated isolation tests use real
    # persisted workspaces and remove these overrides.
    access = AccessContext(
        user=admin,
        workspace=Workspace(id=None, name="Test system workspace"),
        workspace_role="admin",
    )
    app.dependency_overrides[get_current_user] = lambda: admin
    app.dependency_overrides[get_current_access] = lambda: access
    try:
        yield
    finally:
        rate_limiter.reset()
        app.dependency_overrides.pop(get_ai_provider, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_current_access, None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
