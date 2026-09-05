"""AI structured result contract + validation tests.

Covers the strict validation rules for provider output and the deterministic
behaviour of the mock provider. Malformed output must never raise.
"""

from app.services.ai.base import SignalInput
from app.services.ai.mock_provider import MockAIProvider
from app.services.ai.validation import validate_ai_output

SUPPLIED_IDS = ["sig-1", "sig-2", "sig-3"]


def _insight(**overrides) -> dict:
    base = {
        "title": "Loyalty from unique feature",
        "summary": "Customers return for a feature competitors lack.",
        "category": "RETENTION_DRIVER",
        "confidence": 0.82,
        "reasoning_summary": "Multiple signals cite the same feature.",
        "evidence_signal_ids": ["sig-1", "sig-2"],
    }
    base.update(overrides)
    return base


def test_valid_structured_response() -> None:
    raw = {"insights": [_insight()]}
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert len(outcome.result.insights) == 1
    assert outcome.rejected == []
    kept = outcome.result.insights[0]
    assert kept.category.value == "RETENTION_DRIVER"
    assert kept.confidence == 0.82
    assert kept.evidence_signal_ids == ["sig-1", "sig-2"]


def test_invalid_category_rejected() -> None:
    raw = {"insights": [_insight(category="NOT_A_CATEGORY")]}
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert outcome.result.insights == []
    assert len(outcome.rejected) == 1


def test_confidence_out_of_range_rejected() -> None:
    too_high = {"insights": [_insight(confidence=1.5)]}
    too_low = {"insights": [_insight(confidence=-0.2)]}
    assert validate_ai_output(too_high, SUPPLIED_IDS).result.insights == []
    assert validate_ai_output(too_low, SUPPLIED_IDS).result.insights == []


def test_no_evidence_rejected() -> None:
    raw = {"insights": [_insight(evidence_signal_ids=[])]}
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert outcome.result.insights == []
    assert len(outcome.rejected) == 1


def test_nonexistent_evidence_id_rejected() -> None:
    raw = {"insights": [_insight(evidence_signal_ids=["sig-1", "ghost-id"])]}
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert outcome.result.insights == []
    assert any("unknown signal id" in r for r in outcome.rejected)


def test_malformed_result_does_not_crash() -> None:
    # A variety of malformed inputs must all yield an empty result, no raise.
    for raw in [
        "not json at all",
        b"\x00\x01",
        123,
        None,
        {"wrong_key": []},
        {"insights": "not a list"},
        {"insights": [42, "nope", {"missing": "fields"}]},
        '{"insights": [{"title": "x"}]}',  # JSON string missing required fields
    ]:
        outcome = validate_ai_output(raw, SUPPLIED_IDS)
        assert outcome.result.insights == []


def test_partial_valid_kept_invalid_rejected() -> None:
    raw = {
        "insights": [
            _insight(),  # valid
            _insight(category="BOGUS"),  # invalid category
            _insight(evidence_signal_ids=["ghost"]),  # unknown id
        ]
    }
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert len(outcome.result.insights) == 1
    assert len(outcome.rejected) == 2


def test_valid_json_string_input() -> None:
    raw = '{"insights": [{"title":"t","summary":"s","category":"PAIN_POINT","confidence":0.5,"evidence_signal_ids":["sig-3"]}]}'
    outcome = validate_ai_output(raw, SUPPLIED_IDS)
    assert len(outcome.result.insights) == 1
    assert outcome.result.insights[0].category.value == "PAIN_POINT"


def test_mock_provider_is_deterministic_and_valid() -> None:
    provider = MockAIProvider()
    signals = [
        SignalInput(id="sig-1", text="I keep coming back, so loyal to this brand."),
        SignalInput(id="sig-2", text="The refund process was slow and frustrating."),
        SignalInput(id="sig-3", text="   "),  # empty -> produces no insight
    ]

    first = provider.analyze_signals(signals)
    second = provider.analyze_signals(signals)

    # Deterministic: identical structured output across runs.
    assert first.model_dump() == second.model_dump()

    # Every insight obeys the contract and references a supplied id.
    for insight in first.insights:
        assert insight.confidence >= 0.0 and insight.confidence <= 1.0
        assert len(insight.evidence_signal_ids) >= 1
        assert all(sid in {"sig-1", "sig-2", "sig-3"} for sid in insight.evidence_signal_ids)
        # Output is clearly labelled as mock/development.
        assert "[MOCK/DEV]" in insight.title


def test_mock_provider_requires_no_credentials() -> None:
    # Constructing and calling the mock takes no API key or config.
    provider = MockAIProvider()
    result = provider.analyze_signals([SignalInput(id="s1", text="bought it, great price")])
    assert len(result.insights) >= 1


def test_hackathon_provider_raises_until_configured() -> None:
    import pytest

    from app.services.ai.hackathon_provider import (
        HackathonAIProvider,
        HackathonProviderNotConfiguredError,
    )

    provider = HackathonAIProvider()
    with pytest.raises(HackathonProviderNotConfiguredError):
        provider.analyze_signals([SignalInput(id="s1", text="anything")])
    assert provider.health() is False
