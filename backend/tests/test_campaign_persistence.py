"""Persistence contract for briefs, campaigns, content items and approval."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.analysis_run import AnalysisRun
from app.models.campaign import Campaign, CampaignApproval, CampaignContentItem
from app.models.customer_insight import CustomerInsight
from app.models.dataset import Dataset


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
    with TestClient(app) as test_client:
        yield test_client, testing_session
    app.dependency_overrides.clear()


def _client(client: TestClient, name: str) -> int:
    response = client.post("/api/clients", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


def _brief(client: TestClient, client_id: int, objective: str = "Increase trials") -> dict:
    response = client.put(
        f"/api/clients/{client_id}/marketing-brief",
        json={
            "objective": objective,
            "target_audience": "Singapore SME owners",
            "current_message": "Work smarter",
            "channels": ["LinkedIn", "Email"],
        },
    )
    assert response.status_code == 200
    return response.json()


def _analysis_records(session_factory, client_id: int) -> tuple[int, int]:
    session = session_factory()
    try:
        dataset = Dataset(
            client_id=client_id,
            name="Campaign evidence",
            source_type="test",
            status="ready",
        )
        session.add(dataset)
        session.flush()
        run = AnalysisRun(
            client_id=client_id,
            dataset_id=dataset.id,
            status="completed",
            model_provider="mock",
        )
        session.add(run)
        session.flush()
        insight = CustomerInsight(
            client_id=client_id,
            analysis_run_id=run.id,
            title="Fast setup matters",
            summary="Customers value a short setup flow.",
            category="PURCHASE_DRIVER",
            confidence=0.9,
            evidence_count=2,
        )
        session.add(insight)
        session.commit()
        return run.id, insight.id
    finally:
        session.close()


def _campaign_payload(
    brief_id: int,
    run_id: int | None = None,
    insight_id: int | None = None,
) -> dict:
    return {
        "marketing_brief_id": brief_id,
        "analysis_run_id": run_id,
        "primary_insight_id": insight_id,
        "supporting_insight_ids": [insight_id] if insight_id else [],
        "name": "Bright Path · Fast setup matters",
        "key_message": "Start in minutes with customer-proven simplicity.",
        "message_gap": "The active message does not prove setup speed.",
        "cta": "Sign up today",
        "kpi": "Qualified campaign sign-ups",
        "strategy_payload": {
            "alignment": "partial",
            "recommended_actions": ["Demonstrate the setup flow"],
        },
        "content_items": [
            {
                "channel": "LinkedIn",
                "content": "Customer proof: setup in minutes",
                "content_type": "Awareness",
                "sequence_day": 1,
            },
            {
                "channel": "Email",
                "content": "See the complete setup flow",
                "content_type": "Consideration",
                "cta": "Sign up today",
                "sequence_day": 3,
            },
        ],
    }


def test_marketing_brief_is_upserted_and_linked_to_client(env) -> None:
    client, _ = env
    client_id = _client(client, "Brief Owner")

    created = _brief(client, client_id)
    updated = _brief(client, client_id, objective="Increase repeat visits")
    retrieved = client.get(f"/api/clients/{client_id}/marketing-brief")

    assert created["client_id"] == client_id
    assert updated["id"] == created["id"]
    assert retrieved.status_code == 200
    assert retrieved.json()["objective"] == "Increase repeat visits"


def test_campaign_receives_stable_id_and_preserves_analysis_trace(env) -> None:
    client, session_factory = env
    client_id = _client(client, "Campaign Owner")
    brief = _brief(client, client_id)
    run_id, insight_id = _analysis_records(session_factory, client_id)

    response = client.post(
        f"/api/clients/{client_id}/campaigns",
        json=_campaign_payload(brief["id"], run_id, insight_id),
    )

    assert response.status_code == 201
    campaign = response.json()
    assert campaign["id"] >= 1
    assert campaign["client_id"] == client_id
    assert campaign["marketing_brief_id"] == brief["id"]
    assert campaign["analysis_run_id"] == run_id
    assert campaign["primary_insight_id"] == insight_id
    assert campaign["primary_insight"]["title"] == "Fast setup matters"
    assert campaign["objective"] == brief["objective"]
    assert campaign["cta"] == "Sign up today"
    assert campaign["kpi"] == "Qualified campaign sign-ups"
    assert campaign["approval"]["status"] == "pending"


def test_multiple_content_items_are_real_linked_records(env) -> None:
    client, session_factory = env
    client_id = _client(client, "Content Owner")
    brief = _brief(client, client_id)
    campaign = client.post(
        f"/api/clients/{client_id}/campaigns",
        json=_campaign_payload(brief["id"]),
    ).json()

    assert [item["sequence_day"] for item in campaign["content_items"]] == [1, 3]
    session = session_factory()
    try:
        count = session.scalar(
            select(func.count(CampaignContentItem.id)).where(
                CampaignContentItem.campaign_id == campaign["id"]
            )
        )
        assert count == 2
        assert session.scalar(
            select(func.count(CampaignApproval.id)).where(
                CampaignApproval.campaign_id == campaign["id"]
            )
        ) == 1
    finally:
        session.close()


def test_campaign_survives_new_request_and_returns_children(env) -> None:
    client, _ = env
    client_id = _client(client, "Durable Owner")
    brief = _brief(client, client_id)
    created = client.post(
        f"/api/clients/{client_id}/campaigns",
        json=_campaign_payload(brief["id"]),
    ).json()

    retrieved = client.get(f"/api/clients/{client_id}/campaigns/{created['id']}")
    listed = client.get(f"/api/clients/{client_id}/campaigns")

    assert retrieved.status_code == 200
    assert retrieved.json()["id"] == created["id"]
    assert len(retrieved.json()["content_items"]) == 2
    assert [campaign["id"] for campaign in listed.json()] == [created["id"]]


def test_campaigns_are_isolated_by_client(env) -> None:
    client, _ = env
    owner_id = _client(client, "Owner")
    other_id = _client(client, "Other")
    owner_brief = _brief(client, owner_id)
    _brief(client, other_id)
    campaign = client.post(
        f"/api/clients/{owner_id}/campaigns",
        json=_campaign_payload(owner_brief["id"]),
    ).json()

    assert client.get(f"/api/clients/{other_id}/campaigns").json() == []
    cross_client = client.get(
        f"/api/clients/{other_id}/campaigns/{campaign['id']}"
    )
    assert cross_client.status_code == 404


def test_invalid_cross_client_references_are_rejected(env) -> None:
    client, session_factory = env
    owner_id = _client(client, "Owner")
    other_id = _client(client, "Other")
    owner_brief = _brief(client, owner_id)
    other_brief = _brief(client, other_id)
    owner_run_id, _ = _analysis_records(session_factory, owner_id)
    other_run_id, other_insight_id = _analysis_records(session_factory, other_id)

    wrong_brief = client.post(
        f"/api/clients/{owner_id}/campaigns",
        json=_campaign_payload(other_brief["id"]),
    )
    wrong_analysis = client.post(
        f"/api/clients/{owner_id}/campaigns",
        json=_campaign_payload(owner_brief["id"], other_run_id, other_insight_id),
    )
    wrong_insight = client.post(
        f"/api/clients/{owner_id}/campaigns",
        json=_campaign_payload(owner_brief["id"], owner_run_id, other_insight_id),
    )

    assert wrong_brief.status_code == 422
    assert "selected client" in wrong_brief.json()["detail"]
    assert wrong_analysis.status_code == 422
    assert wrong_insight.status_code == 422
    session = session_factory()
    try:
        assert session.scalar(select(func.count(Campaign.id))) == 0
    finally:
        session.close()


def test_campaign_status_updates_persist_in_approval(env) -> None:
    client, _ = env
    client_id = _client(client, "Reviewer")
    brief = _brief(client, client_id)
    campaign = client.post(
        f"/api/clients/{client_id}/campaigns",
        json=_campaign_payload(brief["id"]),
    ).json()

    approved = client.patch(
        f"/api/clients/{client_id}/campaigns/{campaign['id']}/status",
        json={"status": "approved", "reviewer": "Demo reviewer"},
    )
    reloaded = client.get(
        f"/api/clients/{client_id}/campaigns/{campaign['id']}"
    )

    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"
    assert approved.json()["approval"]["reviewer"] == "Demo reviewer"
    assert approved.json()["approval"]["decided_at"] is not None
    assert reloaded.json()["approval"]["status"] == "approved"
