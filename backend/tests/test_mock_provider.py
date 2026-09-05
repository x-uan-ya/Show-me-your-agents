"""Mock AI provider tests.

Verifies the provider maps behavioural language onto the taxonomy and always
returns at least one grounded classification.
"""

from app.services.ai.mock_provider import MockAIProvider
from app.utils.taxonomy import InsightType


def test_detects_pain_point() -> None:
    provider = MockAIProvider()
    results = provider.classify_feedback("The checkout was slow and confusing.")
    types = {r.insight_type for r in results}
    assert InsightType.PAIN_POINT in types
    assert all(r.evidence for r in results)


def test_detects_non_repeat_driver() -> None:
    provider = MockAIProvider()
    results = provider.classify_feedback("I cancelled and switched to a competitor.")
    types = {r.insight_type for r in results}
    assert InsightType.NON_REPEAT_DRIVER in types


def test_always_returns_a_classification() -> None:
    provider = MockAIProvider()
    results = provider.classify_feedback("neutral statement with no signal")
    assert len(results) >= 1
