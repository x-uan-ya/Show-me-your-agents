"""Trial vs Retention behaviour summary tests.

Seeds evidence-backed CustomerInsight records directly and verifies grouping,
the grounding rule (no-evidence insights excluded), the empty state, the
absence of invented percentages, and client scoping.
"""

import re

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.analysis_run import AnalysisRun
from app.models.client import Client
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.models.insight_evidence import InsightEvidence


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


def _seed_client(session):
    c = Client(name="Acme")
    session.add(c)
    session.flush()
    d = Dataset(client_id=c.id, name="ds", source_type="csv")
    session.add(d)
    session.flush()
    run = AnalysisRun(
        client_id=c.id, dataset_id=d.id, model_provider="mock", status="completed"
    )
    session.add(run)
    session.flush()
    return c, d, run


def _add_signal(session, client_id, dataset_id, text):
    s = CustomerSignal(client_id=client_id, dataset_id=dataset_id, text=text)
    session.add(s)
    session.flush()
    return s


def _add_insight(session, *, client_id, run_id, category, title, confidence, evidence):
    ins = CustomerInsight(
        client_id=client_id,
        analysis_run_id=run_id,
        title=title,
        summary="Customer feedback suggests an association.",
        category=category,
        confidence=confidence,
        evidence_count=len(evidence),
        reasoning_summary="Available evidence indicates a pattern.",
    )
    session.add(ins)
    session.flush()
    for sig in evidence:
        session.add(
            InsightEvidence(insight_id=ins.id, signal_id=sig.id, excerpt=sig.text)
        )
    session.flush()
    return ins


def test_groups_trial_retention_non_repeat(env):
    client, session_factory = env
    session = session_factory()
    try:
        c, d, run = _seed_client(session)
        s1 = _add_signal(session, c.id, d.id, "Tried it out of curiosity.")
        s2 = _add_signal(session, c.id, d.id, "I keep coming back, great quality.")
        s3 = _add_signal(session, c.id, d.id, "Not worth full price after the offer.")
        _add_insight(session, client_id=c.id, run_id=run.id, category="TRIAL_DRIVER", title="Curiosity", confidence=0.8, evidence=[s1])
        _add_insight(session, client_id=c.id, run_id=run.id, category="RETENTION_DRIVER", title="Quality", confidence=0.9, evidence=[s2])
        _add_insight(session, client_id=c.id, run_id=run.id, category="NON_REPEAT_DRIVER", title="Full price", confidence=0.6, evidence=[s3])
        session.commit()
        cid = c.id
        s1_id = s1.id  # capture before the session closes (avoids detached load)
    finally:
        session.close()

    resp = client.get(f"/api/clients/{cid}/behaviour-summary")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["trial_drivers"]) == 1
    assert len(body["retention_drivers"]) == 1
    assert len(body["non_repeat_drivers"]) == 1
    assert body["trial_drivers"][0]["title"] == "Curiosity"
    assert body["trial_drivers"][0]["evidence"][0]["signal_id"] == s1_id
    assert body["retention_drivers"][0]["confidence_label"] == "High"
    assert body["non_repeat_drivers"][0]["confidence_label"] == "Medium"
    assert body["limitations"]  # always present


def test_ignores_other_categories(env):
    client, session_factory = env
    session = session_factory()
    try:
        c, d, run = _seed_client(session)
        s = _add_signal(session, c.id, d.id, "The app crashed.")
        _add_insight(session, client_id=c.id, run_id=run.id, category="PAIN_POINT", title="Crash", confidence=0.7, evidence=[s])
        session.commit()
        cid = c.id
    finally:
        session.close()

    body = client.get(f"/api/clients/{cid}/behaviour-summary").json()
    assert body["trial_drivers"] == []
    assert body["retention_drivers"] == []
    assert body["non_repeat_drivers"] == []


def test_grounding_excludes_insights_without_evidence(env):
    client, session_factory = env
    session = session_factory()
    try:
        c, d, run = _seed_client(session)
        # Insight with no evidence rows (evidence_count says 1 but none stored).
        ins = CustomerInsight(
            client_id=c.id,
            analysis_run_id=run.id,
            title="Ungrounded",
            summary="x",
            category="TRIAL_DRIVER",
            confidence=0.8,
            evidence_count=1,
        )
        session.add(ins)
        session.commit()
        cid = c.id
    finally:
        session.close()

    body = client.get(f"/api/clients/{cid}/behaviour-summary").json()
    assert body["trial_drivers"] == []


def test_empty_client_returns_observation(env):
    client, session_factory = env
    session = session_factory()
    try:
        c = Client(name="Empty")
        session.add(c)
        session.commit()
        cid = c.id
    finally:
        session.close()

    body = client.get(f"/api/clients/{cid}/behaviour-summary").json()
    assert body["trial_drivers"] == []
    assert body["retention_drivers"] == []
    assert body["non_repeat_drivers"] == []
    assert any("No evidence-backed" in o for o in body["observations"])
    assert body["limitations"]


def test_no_invented_percentages(env):
    client, session_factory = env
    session = session_factory()
    try:
        c, d, run = _seed_client(session)
        s = _add_signal(session, c.id, d.id, "Bought with a voucher, tried once.")
        _add_insight(session, client_id=c.id, run_id=run.id, category="TRIAL_DRIVER", title="Voucher", confidence=0.5, evidence=[s])
        session.commit()
        cid = c.id
    finally:
        session.close()

    body = client.get(f"/api/clients/{cid}/behaviour-summary").json()
    # No percentage figures anywhere in observations or limitations.
    text = " ".join(body["observations"] + body["limitations"])
    assert "%" not in text
    assert not re.search(r"\d+\s*percent", text, flags=re.IGNORECASE)
    # The transaction-data limitation must be present.
    assert any("transaction" in lim.lower() for lim in body["limitations"])
    # The causation disclaimer must be present.
    assert any("do not by themselves establish causation" in lim for lim in body["limitations"])


def test_wrong_client_returns_404(env):
    client, _ = env
    resp = client.get("/api/clients/999999/behaviour-summary")
    assert resp.status_code == 404
