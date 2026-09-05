"""Evidence-quality assessment tests.

Seeds insights + evidence + signals directly and verifies each flag, status
levels, data-derived limitations, and the missing-insight case.
"""

from datetime import date as date_cls

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


def _seed(session, *, n_dataset_signals, evidence_specs, category="RETENTION_DRIVER",
          confidence=0.8, extra_insights=None):
    """Create a client, dataset, run, signals, and one insight.

    ``evidence_specs`` is a list of dicts with signal fields (source, date,
    product, text, campaign) used to build the supporting signals/evidence.
    Returns the insight id. ``extra_insights`` optionally creates sibling
    insights: list of (category, [signal_index,...]).
    """
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

    # Padding signals to reach the desired dataset size.
    all_signals = []
    for spec in evidence_specs:
        s = CustomerSignal(
            client_id=c.id,
            dataset_id=d.id,
            text=spec.get("text", "some feedback"),
            source=spec.get("source"),
            date=spec.get("date"),
            product=spec.get("product"),
            campaign=spec.get("campaign"),
        )
        session.add(s)
        session.flush()
        all_signals.append(s)

    pad = max(0, n_dataset_signals - len(evidence_specs))
    for _ in range(pad):
        s = CustomerSignal(client_id=c.id, dataset_id=d.id, text="padding")
        session.add(s)
    session.flush()

    insight = CustomerInsight(
        client_id=c.id,
        analysis_run_id=run.id,
        title="Insight",
        summary="x",
        category=category,
        confidence=confidence,
        evidence_count=len(all_signals),
    )
    session.add(insight)
    session.flush()
    for s in all_signals:
        session.add(
            InsightEvidence(insight_id=insight.id, signal_id=s.id, excerpt=s.text)
        )
    session.flush()

    if extra_insights:
        for cat, idxs in extra_insights:
            sib = CustomerInsight(
                client_id=c.id,
                analysis_run_id=run.id,
                title=f"Sibling {cat}",
                summary="x",
                category=cat,
                confidence=0.7,
                evidence_count=len(idxs),
            )
            session.add(sib)
            session.flush()
            for i in idxs:
                session.add(
                    InsightEvidence(
                        insight_id=sib.id,
                        signal_id=all_signals[i].id,
                        excerpt=all_signals[i].text,
                    )
                )
            session.flush()

    session.commit()
    return insight.id


_D1 = date_cls(2024, 1, 1)
_D2 = date_cls(2024, 1, 2)


def _many(source, count, **extra):
    return [{"source": source, **extra} for _ in range(count)]


def test_clean_insight_is_ok(env):
    client, sf = env
    session = sf()
    try:
        # 4 independent signals across 2 sources, large dataset, with context.
        specs = (
            _many("web_review", 2, date=_D1, product="Widget")
            + _many("survey", 2, date=_D2, product="Widget")
        )
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert body["status"] == "OK"
    assert body["flags"] == []
    assert body["independent_evidence_count"] == 4
    assert body["evidence_coverage"] == round(4 / 50, 4)
    assert body["limitations"]  # always has the qualitative/transaction caveats


def test_limited_evidence_flag(env):
    client, sf = env
    session = sf()
    try:
        specs = _many("survey", 2, date=_D1, product="Widget")
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert "LIMITED_EVIDENCE" in body["flags"]
    assert body["status"] == "CAUTION"


def test_small_sample_flag(env):
    client, sf = env
    session = sf()
    try:
        specs = (
            _many("web_review", 2, date=_D1, product="W")
            + _many("survey", 2, date=_D2, product="W")
        )
        # Dataset below default minimum of 30.
        iid = _seed(session, n_dataset_signals=10, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert "SMALL_SAMPLE" in body["flags"]
    assert "Small samples may produce unstable patterns." in body["limitations"]


def test_source_concentration_flag(env):
    client, sf = env
    session = sf()
    try:
        # 4 of 4 from one source -> concentration.
        specs = _many("web_review", 4, date=_D1, product="W")
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert "SOURCE_CONCENTRATION" in body["flags"]
    assert body["source_distribution"] == {"web_review": 4}


def test_conflicting_signals_flag(env):
    client, sf = env
    session = sf()
    try:
        # Same signals support a RETENTION insight and a NON_REPEAT sibling.
        specs = (
            _many("web_review", 2, date=_D1, product="W")
            + _many("survey", 2, date=_D2, product="W")
        )
        iid = _seed(
            session,
            n_dataset_signals=50,
            evidence_specs=specs,
            category="RETENTION_DRIVER",
            extra_insights=[("NON_REPEAT_DRIVER", [0])],
        )
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert "CONFLICTING_SIGNALS" in body["flags"]


def test_limited_context_flag(env):
    client, sf = env
    session = sf()
    try:
        # 4 signals, none carry source/date/product -> limited context.
        specs = [{"text": "no context here"} for _ in range(4)]
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert "LIMITED_CONTEXT" in body["flags"]


def test_promo_limitation_is_data_derived(env):
    client, sf = env
    session = sf()
    try:
        specs = (
            [{"source": "survey", "date": _D1, "product": "W", "text": "used a voucher"}]
            + _many("survey", 3, date=_D2, product="W")
        )
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert any("Promotional activity" in lim for lim in body["limitations"])


def test_no_online_limitation_when_no_online_source(env):
    client, sf = env
    session = sf()
    try:
        # Only survey/support sources -> the online representativeness caveat
        # must NOT appear (limitations are data-derived, not invented).
        specs = _many("survey", 4, date=_D1, product="W")
        iid = _seed(session, n_dataset_signals=50, evidence_specs=specs)
    finally:
        session.close()

    body = client.get(f"/api/insights/{iid}/evidence-quality").json()
    assert not any("Online feedback" in lim for lim in body["limitations"])


def test_missing_insight_returns_404(env):
    client, _ = env
    resp = client.get("/api/insights/999999/evidence-quality")
    assert resp.status_code == 404
