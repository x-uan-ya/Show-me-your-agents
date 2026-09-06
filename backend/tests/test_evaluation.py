"""Tests for the evaluation suite.

These assert the evaluation actually executed and produced coherent, internally
consistent measurements. They do NOT hardcode expected scores (that would defeat
the purpose); they check structure, invariants, and the adversarial PASS/FAIL
outcomes that the system is designed to guarantee.
"""

import pytest
from fastapi.testclient import TestClient

from app.eval.report import build_report, render_text
from app.main import app


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_report_has_all_metrics():
    report = build_report()
    m = report["measured_results"]
    for key in [
        "evidence_linked_insight_rate",
        "unsupported_insight_count",
        "category_agreement",
        "appropriate_uncertainty_rate",
        "cross_client_isolation",
        "prompt_injection_handling",
    ]:
        assert key in m
    assert report["targets"]
    assert report["limitations"]
    assert report["data"] == "SYNTHETIC DEVELOPMENT DATA"


def test_grounding_invariant_holds():
    # The system's core guarantee: no stored insight lacks evidence, so the
    # evidence-linked rate must be 1.0 (when any insight was generated) and the
    # unsupported count must be 0. This is measured, not assumed.
    m = build_report()["measured_results"]
    assert m["unsupported_insight_count"] == 0
    if m["total_generated_insights"] > 0:
        assert m["evidence_linked_insight_rate"] == 1.0


def test_adversarial_outcomes_pass():
    # These are behavioural guarantees the system is built to uphold.
    m = build_report()["measured_results"]
    assert m["cross_client_isolation"] == "PASS"
    assert m["prompt_injection_handling"] == "PASS"
    assert m["unsupported_evidence_rejected"] == "PASS"
    assert m["malformed_output_handled"] == "PASS"


def test_category_agreement_is_ratio_or_none():
    m = build_report()["measured_results"]
    val = m["category_agreement"]
    assert val is None or (0.0 <= val <= 1.0)


def test_report_renders_text():
    text = render_text(build_report())
    assert "MEASURED RESULTS" in text
    assert "TARGETS" in text
    assert "LIMITATIONS" in text


def test_dev_endpoint_returns_report(client: TestClient):
    resp = client.get("/api/eval/report")
    assert resp.status_code == 200
    body = resp.json()
    assert "measured_results" in body
    assert "targets" in body
    assert "limitations" in body
