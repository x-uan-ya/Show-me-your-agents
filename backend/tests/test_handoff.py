"""Handoff API tests: insight-context and export.

Seeds a client and runs the REAL analysis engine (mock provider) so the context
reflects genuine stored insights, then verifies the handoff contract.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.client import Client
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset

# Fields that must always be present on the context envelope.
_GROUP_FIELDS = [
    "purchase_drivers",
    "trial_drivers",
    "retention_drivers",
    "non_repeat_drivers",
    "pain_points",
    "unmet_needs",
    "customer_anxieties",
    "emerging_demand",
]

# Concepts that must NEVER appear in the handoff payload.
_FORBIDDEN_KEYS = {
    "campaign",
    "campaigns",
    "objectives",
    "recommendations",
    "ideas",
    "content",
    "calendar",
    "schedule",
    "publishing",
}


@pytest.fixture
def env():
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
    client = TestClient(app)
    try:
        yield client, TestingSession
    finally:
        app.dependency_overrides.clear()


def _make_client(client: TestClient, name: str) -> int:
    return client.post("/api/clients", json={"name": name}).json()["id"]


def _seed_dataset(session_factory, client_id, texts):
    session = session_factory()
    try:
        d = Dataset(
            client_id=client_id, name="ds", source_type="synthetic", status="ready"
        )
        session.add(d)
        session.flush()
        for t in texts:
            session.add(
                CustomerSignal(
                    client_id=client_id,
                    dataset_id=d.id,
                    text=t,
                    source="web_review",
                    product="Kettle",
                )
            )
        session.commit()
        return d.id
    finally:
        session.close()


def _analysed_client(client: TestClient, session_factory) -> int:
    cid = _make_client(client, "Acme")
    dataset_id = _seed_dataset(
        session_factory,
        cid,
        [
            "I bought it because the price was low.",
            "The support was slow and frustrating.",
            "I keep coming back, loyal to this brand.",
        ],
    )
    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": dataset_id})
    assert resp.status_code == 200
    return cid


def test_insight_context_shape(env):
    client, sf = env
    cid = _analysed_client(client, sf)

    resp = client.get(f"/api/clients/{cid}/insight-context")
    assert resp.status_code == 200
    body = resp.json()

    assert body["client_id"] == cid
    assert body["analysis_run_id"] is not None
    assert body["dataset_id"] is not None
    assert body["generated_at"] is not None
    for field in _GROUP_FIELDS:
        assert field in body and isinstance(body[field], list)
    assert "data_quality" in body and body["data_quality"] is not None
    assert "limitations" in body and isinstance(body["limitations"], list)


def test_insight_context_grouping_and_fields(env):
    client, sf = env
    cid = _analysed_client(client, sf)
    body = client.get(f"/api/clients/{cid}/insight-context").json()

    # Purchase + pain + retention signals were seeded; those groups populated.
    assert body["purchase_drivers"], "expected a purchase driver"
    assert body["pain_points"], "expected a pain point"
    assert body["retention_drivers"], "expected a retention driver"

    insight = body["purchase_drivers"][0]
    for key in [
        "insight_id",
        "category",
        "title",
        "summary",
        "confidence",
        "confidence_label",
        "evidence_count",
        "evidence_quality",
        "supporting_evidence_ids",
    ]:
        assert key in insight
    assert insight["category"] == "PURCHASE_DRIVER"
    assert insight["evidence_count"] >= 1
    assert len(insight["supporting_evidence_ids"]) >= 1
    assert insight["evidence_quality"]["status"] in {"OK", "CAUTION", "INSUFFICIENT"}


def test_no_campaign_concepts_present(env):
    client, sf = env
    cid = _analysed_client(client, sf)
    body = client.get(f"/api/clients/{cid}/insight-context").json()

    def keys_recursive(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                yield k.lower()
                yield from keys_recursive(v)
        elif isinstance(obj, list):
            for item in obj:
                yield from keys_recursive(item)

    present = set(keys_recursive(body))
    assert present.isdisjoint(_FORBIDDEN_KEYS)


def test_no_run_returns_empty_but_valid_context(env):
    client, sf = env
    cid = _make_client(client, "NoRun")

    resp = client.get(f"/api/clients/{cid}/insight-context")
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_id"] == cid
    assert body["analysis_run_id"] is None
    for field in _GROUP_FIELDS:
        assert body[field] == []
    assert body["limitations"]  # explains that no run exists


def test_invalid_client_returns_404(env):
    client, _ = env
    resp = client.get("/api/clients/999999/insight-context")
    assert resp.status_code == 404


def test_client_isolation(env):
    client, sf = env
    a = _analysed_client(client, sf)
    b = _make_client(client, "Client B")

    # B has no run: its context is empty and contains none of A's insights.
    b_ctx = client.get(f"/api/clients/{b}/insight-context").json()
    assert all(b_ctx[f] == [] for f in _GROUP_FIELDS)
    assert b_ctx["analysis_run_id"] is None


def test_export_json(env):
    client, sf = env
    cid = _analysed_client(client, sf)

    resp = client.get(f"/api/clients/{cid}/insights/export?format=json")
    assert resp.status_code == 200
    body = resp.json()
    assert body["client_id"] == cid
    assert body["purchase_drivers"]


def test_export_csv(env):
    client, sf = env
    cid = _analysed_client(client, sf)

    resp = client.get(f"/api/clients/{cid}/insights/export?format=csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    text = resp.text
    lines = [ln for ln in text.splitlines() if ln.strip()]
    # Header + at least the three seeded insights.
    assert lines[0].startswith("client_id,analysis_run_id,dataset_id,insight_id")
    assert len(lines) >= 4
    assert "PURCHASE_DRIVER" in text


def test_export_invalid_format_rejected(env):
    client, sf = env
    cid = _analysed_client(client, sf)

    resp = client.get(f"/api/clients/{cid}/insights/export?format=xml")
    assert resp.status_code == 422  # fails the query pattern validation
