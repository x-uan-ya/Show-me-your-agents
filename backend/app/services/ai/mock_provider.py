"""Mock AI provider.

Runs with no external API key. It uses lightweight keyword heuristics to map
feedback text onto the insight taxonomy so the full pipeline is exercisable in
development and tests. This is NOT sentiment analysis: the heuristics target
behavioural signals (why buy / try / return / churn / problems / needs).
"""

from app.schemas.insight import InsightClassification
from app.services.ai.base import AIProvider
from app.utils.taxonomy import InsightType

# Keyword hints per insight type. Intentionally simple and transparent.
_KEYWORD_HINTS: dict[InsightType, tuple[str, ...]] = {
    InsightType.PURCHASE_DRIVER: ("bought", "purchased", "decided to buy", "chose", "value for money"),
    InsightType.TRIAL_DRIVER: ("tried", "gave it a go", "first time", "sample", "trial"),
    InsightType.RETENTION_DRIVER: ("came back", "returned", "again", "loyal", "keep using", "renew"),
    InsightType.NON_REPEAT_DRIVER: ("won't return", "never again", "stopped", "cancelled", "switched to", "not coming back"),
    InsightType.PAIN_POINT: ("problem", "issue", "broken", "difficult", "frustrating", "slow", "confusing"),
    InsightType.UNMET_NEED: ("wish", "would love", "need", "if only", "should have", "missing"),
    InsightType.CUSTOMER_ANXIETY: ("worried", "nervous", "unsure", "risk", "afraid", "concerned", "hesitant"),
    InsightType.EMERGING_DEMAND: ("everyone wants", "trend", "new expectation", "increasingly", "starting to want"),
}


class MockAIProvider(AIProvider):
    name = "mock"

    def classify_feedback(self, content: str) -> list[InsightClassification]:
        text = content.lower()
        results: list[InsightClassification] = []

        for insight_type, keywords in _KEYWORD_HINTS.items():
            matched = next((kw for kw in keywords if kw in text), None)
            if matched is not None:
                results.append(
                    InsightClassification(
                        insight_type=insight_type,
                        summary=f"Detected signal for {insight_type.value} via '{matched}'.",
                        evidence=content.strip(),
                        confidence=0.6,
                    )
                )

        # Guarantee at least one classification so downstream flows have data.
        if not results:
            results.append(
                InsightClassification(
                    insight_type=InsightType.UNMET_NEED,
                    summary="No strong behavioural signal detected; flagged for review.",
                    evidence=content.strip(),
                    confidence=0.2,
                )
            )

        return results
