"""Mock AI provider.

Runs locally with no external API key and is fully deterministic: the same input
always yields the same output, which makes it suitable for development and
automated tests. It uses transparent keyword heuristics to map customer signals
onto the behavioural insight categories. This is NOT sentiment analysis and it
is NOT a real model; every result is clearly labelled as mock/development output.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.schemas.ai_result import AIAnalysisResult, AIInsight
from app.schemas.insight import InsightClassification
from app.services.ai.base import AIProvider, SignalInput
from app.services.ai.validation import validate_ai_output
from app.utils.categories import InsightCategory
from app.utils.taxonomy import InsightType

# Marker so mock output is never mistaken for real model analysis.
MOCK_LABEL = "[MOCK/DEV]"

# Keyword hints per category. Ordered so iteration is deterministic.
_CATEGORY_HINTS: list[tuple[InsightCategory, tuple[str, ...]]] = [
    (InsightCategory.PURCHASE_DRIVER, ("bought", "purchased", "cheap", "price", "value for money", "convenient")),
    (InsightCategory.TRIAL_DRIVER, ("tried", "curious", "voucher", "sample", "first time", "gave it a go")),
    (InsightCategory.RETENTION_DRIVER, ("came back", "again", "loyal", "keep", "repeat", "stuck with")),
    (InsightCategory.NON_REPEAT_DRIVER, ("won't", "not worth", "full price", "never again", "switched", "not coming back")),
    (InsightCategory.PAIN_POINT, ("problem", "issue", "slow", "frustrating", "refund", "support", "waited")),
    (InsightCategory.UNMET_NEED, ("wish", "would love", "need", "missing", "bring back")),
    (InsightCategory.CUSTOMER_ANXIETY, ("worried", "nervous", "unsure", "hesitant", "reassured", "afraid")),
    (InsightCategory.EMERGING_DEMAND, ("everyone", "trend", "increasingly", "new expectation")),
]

# Fixed, deterministic confidence per category (no randomness).
_BASE_CONFIDENCE = 0.55


def _match_category(text: str) -> tuple[InsightCategory, str] | None:
    lowered = text.lower()
    for category, keywords in _CATEGORY_HINTS:
        matched = next((kw for kw in keywords if kw in lowered), None)
        if matched is not None:
            return category, matched
    return None


class MockAIProvider(AIProvider):
    name = "mock"

    def analyze_signals(self, signals: Sequence[SignalInput]) -> AIAnalysisResult:
        """Deterministically classify signals into the structured contract.

        Output is validated against the same rules as any provider, and against
        the set of supplied signal ids, so the mock can never emit an invalid or
        unsupported result.
        """
        supplied_ids = [s.id for s in signals]
        raw_insights: list[dict] = []

        for signal in signals:
            text = signal.text.strip()
            if not text:
                continue
            match = _match_category(text)
            if match is None:
                continue
            category, keyword = match
            raw_insights.append(
                {
                    "title": f"{MOCK_LABEL} Possible {category.value.replace('_', ' ').lower()} signal",
                    "summary": (
                        f"{MOCK_LABEL} Customer feedback suggests this may be "
                        f"associated with {category.value}. Development output "
                        "only, not real model analysis."
                    ),
                    "category": category.value,
                    "confidence": _BASE_CONFIDENCE,
                    "reasoning_summary": (
                        f"{MOCK_LABEL} Available evidence indicates the wording "
                        f"'{keyword}' appears related to {category.value}. This "
                        "is a deterministic keyword association, not a proven cause."
                    ),
                    "evidence_signal_ids": [signal.id],
                }
            )

        # Route through the shared validator: guarantees a clean, contract-valid
        # result even though we constructed it ourselves.
        outcome = validate_ai_output({"insights": raw_insights}, supplied_ids)
        return outcome.result

    def classify_feedback(self, content: str) -> list[InsightClassification]:
        """Legacy per-feedback path used by the existing insight engine."""
        text = content.lower()
        results: list[InsightClassification] = []

        legacy_hints: dict[InsightType, tuple[str, ...]] = {
            InsightType.PURCHASE_DRIVER: ("bought", "purchased", "chose", "value for money"),
            InsightType.TRIAL_DRIVER: ("tried", "gave it a go", "first time", "sample", "trial"),
            InsightType.RETENTION_DRIVER: ("came back", "returned", "again", "loyal", "keep using"),
            InsightType.NON_REPEAT_DRIVER: ("won't return", "never again", "stopped", "cancelled", "switched to"),
            InsightType.PAIN_POINT: ("problem", "issue", "broken", "difficult", "frustrating", "slow", "confusing"),
            InsightType.UNMET_NEED: ("wish", "would love", "need", "if only", "should have", "missing"),
            InsightType.CUSTOMER_ANXIETY: ("worried", "nervous", "unsure", "risk", "afraid", "concerned", "hesitant"),
            InsightType.EMERGING_DEMAND: ("everyone wants", "trend", "new expectation", "increasingly"),
        }

        for insight_type, keywords in legacy_hints.items():
            matched = next((kw for kw in keywords if kw in text), None)
            if matched is not None:
                results.append(
                    InsightClassification(
                        insight_type=insight_type,
                        summary=f"{MOCK_LABEL} Detected signal for {insight_type.value} via '{matched}'.",
                        evidence=content.strip(),
                        confidence=0.6,
                    )
                )

        if not results:
            results.append(
                InsightClassification(
                    insight_type=InsightType.UNMET_NEED,
                    summary=f"{MOCK_LABEL} No strong behavioural signal detected; flagged for review.",
                    evidence=content.strip(),
                    confidence=0.2,
                )
            )

        return results
