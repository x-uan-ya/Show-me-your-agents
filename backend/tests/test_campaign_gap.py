"""Dataset 3 customer-message gap API tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.services.ai.factory import get_ai_provider
from app.services.ai.mock_provider import MockAIProvider


@pytest.fixture
def env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ai_provider] = lambda: MockAIProvider()
    client = TestClient(app)
    try:
        yield client, testing_session
    finally:
        app.dependency_overrides.clear()


def _analysed_client(client: TestClient, session_factory) -> int:
    client_id = client.post("/api/clients", json={"name": "Harbour Brew"}).json()["id"]
    session = session_factory()
    try:
        dataset = Dataset(
            client_id=client_id,
            name="feedback",
            source_type="synthetic",
            status="ready",
        )
        session.add(dataset)
        session.flush()
        for text in (
            "I bought it because the price was convenient.",
            "The lunch queue was slow and frustrating.",
            "I keep coming back because the meals are reliable.",
        ):
            session.add(
                CustomerSignal(
                    client_id=client_id,
                    dataset_id=dataset.id,
                    text=text,
                    source="survey",
                )
            )
        session.commit()
        dataset_id = dataset.id
    finally:
        session.close()

    response = client.post(
        f"/api/clients/{client_id}/analyse", json={"dataset_id": dataset_id}
    )
    assert response.status_code == 200
    return client_id


def test_lists_validated_dataset3_parameters(env):
    client, _ = env
    response = client.get("/api/campaign-parameters")

    assert response.status_code == 200
    records = response.json()
    assert len(records) == 500
    assert records[0]["campaign_id"] == "CAM001"
    assert set(records[0]) == {
        "campaign_id",
        "objective",
        "target_audience",
        "active_message",
        "channel",
    }


def test_analyses_campaign_against_latest_client_insights(env):
    client, session_factory = env
    client_id = _analysed_client(client, session_factory)

    response = client.post(
        f"/api/clients/{client_id}/campaign-gap",
        json={"campaign_id": "CAM001"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == client_id
    assert body["campaign"]["campaign_id"] == "CAM001"
    assert body["analysis"]["alignment"] in {
        "aligned",
        "partial",
        "misaligned",
    }
    assert body["analysis"]["supporting_insight_ids"]


def test_auto_matches_brief_to_dataset3_before_analysis(env):
    client, session_factory = env
    client_id = _analysed_client(client, session_factory)

    response = client.post(
        f"/api/clients/{client_id}/campaign-gap/auto",
        json={
            "objective": "Increase weekday lunch traffic",
            "target_audience": "Office workers aged 22-45 in CBD and business parks",
            "active_message": (
                "Fast, satisfying lunch sets designed for busy workdays without "
                "a long wait."
            ),
            "channels": ["Instagram"],
        },
    )

    assert response.status_code == 200
    assert response.json()["campaign"]["campaign_id"] == "CAM001"


def test_gap_requires_existing_campaign(env):
    client, session_factory = env
    client_id = _analysed_client(client, session_factory)

    response = client.post(
        f"/api/clients/{client_id}/campaign-gap",
        json={"campaign_id": "NOT-A-CAMPAIGN"},
    )

    assert response.status_code == 404


def test_gap_requires_completed_customer_insights(env):
    client, _ = env
    client_id = client.post("/api/clients", json={"name": "No insights"}).json()["id"]

    response = client.post(
        f"/api/clients/{client_id}/campaign-gap",
        json={"campaign_id": "CAM001"},
    )

    assert response.status_code == 422
