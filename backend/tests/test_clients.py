"""Client API tests.

Uses an isolated in-memory SQLite database via a dependency override so tests
are deterministic and independent of any on-disk dev database. Covers client
creation/retrieval, invalid client handling, dataset ownership, and the fact
that one client cannot see another client's records.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.dataset import Dataset


@pytest.fixture
def client() -> TestClient:
    # In-memory DB shared across connections for the duration of the test.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # Expose the session factory for direct data seeding in tests.
    app.state.testing_session = TestingSession
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _create_client(client: TestClient, name: str = "Acme SME") -> dict:
    response = client.post("/api/clients", json={"name": name, "industry": "retail"})
    assert response.status_code == 201
    return response.json()


def test_create_client(client: TestClient) -> None:
    data = _create_client(client, "Acme SME")
    assert data["id"] >= 1
    assert data["name"] == "Acme SME"
    assert data["industry"] == "retail"
    assert "created_at" in data and "updated_at" in data


def test_get_client(client: TestClient) -> None:
    created = _create_client(client)
    response = client.get(f"/api/clients/{created['id']}")
    assert response.status_code == 200
    assert response.json()["id"] == created["id"]


def test_list_clients(client: TestClient) -> None:
    _create_client(client, "Client One")
    _create_client(client, "Client Two")
    response = client.get("/api/clients")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_invalid_client_returns_404(client: TestClient) -> None:
    response = client.get("/api/clients/9999")
    assert response.status_code == 404


def test_dataset_ownership(client: TestClient) -> None:
    created = _create_client(client)
    client_id = created["id"]

    # Seed a dataset for this client directly.
    session = app.state.testing_session()
    try:
        dataset = Dataset(
            client_id=client_id,
            name="Reviews Q1",
            source_type="csv",
            record_count=3,
            status="ready",
        )
        session.add(dataset)
        session.commit()
    finally:
        session.close()

    response = client.get(f"/api/clients/{client_id}/datasets")
    assert response.status_code == 200
    datasets = response.json()
    assert len(datasets) == 1
    assert datasets[0]["client_id"] == client_id
    assert datasets[0]["name"] == "Reviews Q1"


def test_cross_client_access_is_isolated(client: TestClient) -> None:
    owner = _create_client(client, "Owner")
    other = _create_client(client, "Other")

    # Dataset belongs only to the owner.
    session = app.state.testing_session()
    try:
        session.add(
            Dataset(
                client_id=owner["id"],
                name="Owner Dataset",
                source_type="csv",
                record_count=1,
                status="ready",
            )
        )
        session.commit()
    finally:
        session.close()

    # Owner sees the dataset.
    owner_view = client.get(f"/api/clients/{owner['id']}/datasets").json()
    assert len(owner_view) == 1

    # The other client sees none of the owner's datasets.
    other_view = client.get(f"/api/clients/{other['id']}/datasets").json()
    assert other_view == []
