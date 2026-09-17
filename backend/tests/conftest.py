"""Pytest fixtures."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.ai.factory import get_ai_provider
from app.services.ai.mock_provider import MockAIProvider


@pytest.fixture(autouse=True)
def use_mock_ai_provider():
    """Never spend gateway credit or require credentials in automated tests."""
    app.dependency_overrides[get_ai_provider] = lambda: MockAIProvider()
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_ai_provider, None)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)
