"""Customer Insight Engine tests.

Uses an isolated in-memory SQLite database and a stub AI provider injected via
dependency override, so each scenario controls exactly what the "model" returns.
Covers valid analysis, empty dataset, cross-client dataset, unsupported and
duplicate evidence, malformed responses, provider failure, low-confidence, and
multiple categories.
"""

from collections.abc import Sequence

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.analysis_run import AnalysisRun
from app.models.client import Client
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.schemas.ai_result import AIAnalysisResult
from app.services.ai.base import AIProvider, SignalInput
from app.services.ai.factory import get_ai_provider
from app.services.ai.validation import validate_ai_output


class StubProvider(AIProvider):
    """AI provider with a settable preset payload (or a raising exception).

    ``payload`` is validated against the supplied signal ids just like a real
    provider would validate its own output, so tests exercise the real contract.
    """

    name = "stub"

    def __init__(self) -> None:
        self.payload = {"insights": []}
        self.raise_exc: Exception | None = None
        # When False, return the payload without self-validation so the engine's
        # own validation/grounding path is exercised directly.
        self.self_validate = True

    def analyze_signals(self, signals: Sequence[SignalInput]) -> AIAnalysisResult:
        if self.raise_exc is not None:
            raise self.raise_exc
        supplied = [s.id for s in signals]
        if self.self_validate:
            return validate_ai_output(self.payload, supplied).result
        # Bypass validation: construct a result object directly from the payload
        # so unsupported/duplicate ids reach the engine untouched.
        return AIAnalysisResult.model_validate(self.payload)


@pytest.fixture
def env():
    """Provides an isolated app env: TestClient, session factory, and stub."""
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

    stub = StubProvider()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ai_provider] = lambda: stub

    client = TestClient(app)
    try:
        yield client, TestingSession, stub
    finally:
        app.dependency_overrides.clear()


def _seed(session_factory, texts, client_name="Acme"):
    """Create a client + dataset + signals; return (client_id, dataset_id, signal_ids)."""
    session = session_factory()
    try:
        client = Client(name=client_name)
        session.add(client)
        session.flush()
        dataset = Dataset(
            client_id=client.id, name="ds", source_type="csv", status="ready"
        )
        session.add(dataset)
        session.flush()
        signal_ids = []
        for t in texts:
            s = CustomerSignal(client_id=client.id, dataset_id=dataset.id, text=t)
            session.add(s)
            session.flush()
            signal_ids.append(s.id)
        session.commit()
        return client.id, dataset.id, signal_ids
    finally:
        session.close()


def _insight(signal_ids, category="PURCHASE_DRIVER", confidence=0.8, title="t"):
    return {
        "title": title,
        "summary": "Customer feedback suggests an association.",
        "category": category,
        "confidence": confidence,
        "reasoning_summary": "Available evidence indicates a pattern.",
        "evidence_signal_ids": [str(sid) for sid in signal_ids],
    }


def test_valid_analysis(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Bought it, great value.", "Love it."])
    stub.payload = {"insights": [_insight([sids[0]], category="PURCHASE_DRIVER")]}

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    body = resp.json()
    assert body["analysis_run"]["status"] == "completed"
    assert len(body["insights"]) == 1
    ins = body["insights"][0]
    assert ins["category"] == "PURCHASE_DRIVER"
    assert ins["evidence_count"] == 1
    assert ins["confidence_label"] == "High"
    assert ins["evidence"][0]["signal_id"] == sids[0]


def test_empty_dataset(env):
    client, session_factory, stub = env
    session = session_factory()
    try:
        c = Client(name="Empty")
        session.add(c)
        session.flush()
        d = Dataset(client_id=c.id, name="ds", source_type="csv")
        session.add(d)
        session.commit()
        cid, did = c.id, d.id
    finally:
        session.close()

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 422


def test_dataset_belongs_to_another_client(env):
    client, session_factory, stub = env
    session = session_factory()
    try:
        owner = Client(name="Owner")
        other = Client(name="Other")
        session.add_all([owner, other])
        session.flush()
        d = Dataset(client_id=owner.id, name="ds", source_type="csv")
        session.add(d)
        session.flush()
        session.add(CustomerSignal(client_id=owner.id, dataset_id=d.id, text="hello"))
        session.commit()
        other_id, did = other.id, d.id
    finally:
        session.close()

    resp = client.post(f"/api/clients/{other_id}/analyse", json={"dataset_id": did})
    assert resp.status_code == 403


def test_unsupported_evidence_not_stored(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Some feedback."])
    # Send unsupported evidence straight to the engine (no provider self-validation)
    # to exercise the engine's grounding + rejection path.
    stub.self_validate = False
    stub.payload = {"insights": [_insight(["999999"])]}  # id not supplied

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    body = resp.json()
    # Grounding rule: an insight with no valid evidence is never stored.
    assert body["insights"] == []
    assert len(body["rejected"]) >= 1


def test_duplicate_evidence_deduped(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Repeated evidence."])
    dup = str(sids[0])
    stub.payload = {"insights": [_insight([dup, dup, dup])]}

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    ins = resp.json()["insights"][0]
    assert ins["evidence_count"] == 1
    assert len(ins["evidence"]) == 1


def test_malformed_ai_response(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Feedback text."])
    stub.payload = "this is not a valid structure"

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    body = resp.json()
    assert body["insights"] == []
    assert body["analysis_run"]["status"] == "completed"


def test_provider_failure(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Feedback text."])
    stub.raise_exc = RuntimeError("model exploded")

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 502

    session = session_factory()
    try:
        runs = session.query(AnalysisRun).all()
        assert len(runs) == 1
        assert runs[0].status == "failed"
        assert "model exploded" in (runs[0].error_message or "")
    finally:
        session.close()


def test_low_confidence_result(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(session_factory, ["Ambiguous feedback."])
    stub.payload = {"insights": [_insight([sids[0]], confidence=0.3)]}

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    ins = resp.json()["insights"][0]
    assert ins["confidence"] == 0.3
    assert ins["confidence_label"] == "Low"
    assert ins["evidence_count"] == 1


def test_multiple_categories(env):
    client, session_factory, stub = env
    cid, did, sids = _seed(
        session_factory,
        ["Bought for price.", "Support was slow.", "Wish they had decaf."],
    )
    stub.payload = {
        "insights": [
            _insight([sids[0]], category="PURCHASE_DRIVER", title="a"),
            _insight([sids[1]], category="PAIN_POINT", confidence=0.6, title="b"),
            _insight([sids[2]], category="UNMET_NEED", confidence=0.9, title="c"),
        ]
    }

    resp = client.post(f"/api/clients/{cid}/analyse", json={"dataset_id": did})
    assert resp.status_code == 200
    insights = resp.json()["insights"]
    assert len(insights) == 3
    categories = {i["category"] for i in insights}
    assert categories == {"PURCHASE_DRIVER", "PAIN_POINT", "UNMET_NEED"}
    labels = {i["category"]: i["confidence_label"] for i in insights}
    assert labels["PAIN_POINT"] == "Medium"
    assert labels["UNMET_NEED"] == "High"
