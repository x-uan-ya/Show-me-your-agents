"""Persistence contract for briefs, campaigns, content items and approval."""

from datetime import date

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


def test_workflow_status_is_calculated_from_persisted_records(env) -> None:
    client, session_factory = env
    client_id = _client(client, "Guided workflow")

    initial = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert initial["recommended_next_step"] == "brief"
    assert initial["client"] is True
    assert initial["brief"] is False

    brief = _brief(client, client_id)
    after_brief = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert after_brief["brief"] is True
    assert after_brief["recommended_next_step"] == "data"

    session = session_factory()
    try:
        session.add(Dataset(
            client_id=client_id,
            name="Ready feedback",
            source_type="test",
            status="ready",
        ))
        session.commit()
    finally:
        session.close()
    after_data = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert after_data["data"] is True
    assert after_data["recommended_next_step"] == "analysis"

    run_id, insight_id = _analysis_records(session_factory, client_id)
    after_analysis = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert after_analysis["analysis"] is True
    assert after_analysis["insights"] is True
    assert after_analysis["latest_analysis_run_id"] == run_id
    assert after_analysis["insight_count"] == 1
    assert after_analysis["recommended_next_step"] == "campaign"

    campaign = client.post(
        f"/api/clients/{client_id}/campaigns",
        json=_campaign_payload(brief["id"], run_id, insight_id),
    ).json()
    after_campaign = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert after_campaign["campaign"] is True
    assert after_campaign["latest_campaign_id"] == campaign["id"]
    assert after_campaign["recommended_next_step"] == "approval"

    approved = client.patch(
        f"/api/clients/{client_id}/campaigns/{campaign['id']}/status",
        json={"status": "approved", "reviewer": "Workflow test"},
    )
    assert approved.status_code == 200
    after_approval = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert after_approval["approval"] is True
    assert after_approval["schedule"] is False
    assert after_approval["recommended_next_step"] == "schedule"

    session = session_factory()
    try:
        item = session.scalar(
            select(CampaignContentItem).where(
                CampaignContentItem.campaign_id == campaign["id"]
            )
        )
        assert item is not None
        item.publish_date = date(2026, 9, 25)
        session.commit()
    finally:
        session.close()
    completed = client.get(f"/api/clients/{client_id}/workflow-status").json()
    assert completed["schedule"] is True
    assert completed["scheduled_item_count"] == 1
    assert completed["recommended_next_step"] == "complete"


def test_calendar_returns_dated_content_with_campaign_and_client_context(env) -> None:
    client, _ = env
    owner_id = _client(client, "Sunny Cafe")
    other_id = _client(client, "TechStart")
    owner_brief = _brief(client, owner_id)
    other_brief = _brief(client, other_id)

    owner_payload = _campaign_payload(owner_brief["id"])
    owner_payload["name"] = "Lunch Rush Recovery"
    owner_payload["content_items"] = [
        {
            "channel": "Instagram",
            "content": "Skip the Queue Reel",
            "content_type": "Reel",
            "cta": "Order ahead",
            "sequence_day": 1,
            "publish_date": "2026-09-22",
            "owner": "Maya",
            "status": "scheduled",
        },
        {
            "channel": "Email",
            "content": "Lunch Promotion",
            "content_type": "Newsletter",
            "sequence_day": 3,
            "publish_date": "2026-09-24",
            "status": "draft",
        },
        {
            "channel": "Instagram",
            "content": "Undated idea",
            "sequence_day": 5,
            "status": "draft",
        },
    ]
    owner_campaign = client.post(
        f"/api/clients/{owner_id}/campaigns",
        json=owner_payload,
    ).json()

    other_payload = _campaign_payload(other_brief["id"])
    other_payload["name"] = "Faster Onboarding"
    other_payload["content_items"] = [
        {
            "channel": "TikTok",
            "content": "Fast Pickup Video",
            "sequence_day": 1,
            "publish_date": "2026-09-27",
            "status": "published",
        }
    ]
    assert client.post(
        f"/api/clients/{other_id}/campaigns",
        json=other_payload,
    ).status_code == 201

    response = client.get(
        "/api/calendar?start_date=2026-09-01&end_date=2026-09-30"
    )

    assert response.status_code == 200
    items = response.json()
    assert [item["publish_date"] for item in items] == [
        "2026-09-22",
        "2026-09-24",
        "2026-09-27",
    ]
    assert [item["campaign_id"] for item in items[:2]] == [
        owner_campaign["id"],
        owner_campaign["id"],
    ]
    assert items[0] == {
        "id": items[0]["id"],
        "campaign_id": owner_campaign["id"],
        "campaign_name": "Lunch Rush Recovery",
        "campaign_status": "draft",
        "client_id": owner_id,
        "client_name": "Sunny Cafe",
        "channel": "Instagram",
        "publish_date": "2026-09-22",
        "status": "scheduled",
        "content": "Skip the Queue Reel",
        "content_type": "Reel",
        "cta": "Order ahead",
        "owner": "Maya",
    }
    assert items[2]["client_name"] == "TechStart"
    assert all(item["content"] != "Undated idea" for item in items)


def test_calendar_filters_preserve_client_isolation_and_real_values(env) -> None:
    client, _ = env
    owner_id = _client(client, "Calendar Owner")
    other_id = _client(client, "Other Calendar Owner")
    for client_id, channel, item_status in [
        (owner_id, "Instagram", "scheduled"),
        (other_id, "Email", "draft"),
    ]:
        brief = _brief(client, client_id)
        payload = _campaign_payload(brief["id"])
        payload["content_items"] = [
            {
                "channel": channel,
                "content": f"{channel} content",
                "sequence_day": 1,
                "publish_date": "2026-09-22",
                "status": item_status,
            }
        ]
        assert client.post(
            f"/api/clients/{client_id}/campaigns",
            json=payload,
        ).status_code == 201

    scoped = client.get(
        f"/api/calendar?client_id={owner_id}&channel=Instagram&status=scheduled"
    )
    outside_month = client.get(
        f"/api/calendar?client_id={owner_id}&start_date=2026-10-01&end_date=2026-10-31"
    )

    assert scoped.status_code == 200
    assert len(scoped.json()) == 1
    assert scoped.json()[0]["client_id"] == owner_id
    assert scoped.json()[0]["channel"] == "Instagram"
    assert scoped.json()[0]["status"] == "scheduled"
    assert outside_month.json() == []


def test_calendar_rejects_invalid_filters(env) -> None:
    client, _ = env

    assert client.get("/api/calendar?client_id=9999").status_code == 404
    assert client.get(
        "/api/calendar?start_date=2026-10-01&end_date=2026-09-01"
    ).status_code == 422
    assert client.get("/api/calendar?status=unsupported").status_code == 422
