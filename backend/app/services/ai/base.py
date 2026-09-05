"""AI provider interface.

The system must never be tightly coupled to a single AI vendor. Every provider
(mock, AWS Bedrock, OpenAI, or a future one) implements this interface. Business
logic depends only on ``AIProvider``, never on a concrete vendor SDK.
"""

from abc import ABC, abstractmethod

from app.schemas.insight import InsightClassification


class AIProvider(ABC):
    """Abstract contract every AI provider must satisfy."""

    #: Short identifier, e.g. "mock", "bedrock", "openai".
    name: str = "base"

    @abstractmethod
    def classify_feedback(self, content: str) -> list[InsightClassification]:
        """Classify a single piece of feedback into evidence-backed insights.

        Implementations must return zero or more :class:`InsightClassification`
        objects. Each result should carry a verbatim ``evidence`` excerpt so the
        insight remains traceable to its source.
        """
        raise NotImplementedError

    def health(self) -> bool:
        """Return True if the provider is ready to serve requests."""
        return True
