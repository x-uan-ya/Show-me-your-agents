"""Health endpoint tests."""

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_taxonomy_returns_eight_types(client: TestClient) -> None:
    response = client.get("/api/insights/taxonomy")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 8
    types = {entry["type"] for entry in data}
    assert "purchase_driver" in types
    assert "emerging_demand" in types
