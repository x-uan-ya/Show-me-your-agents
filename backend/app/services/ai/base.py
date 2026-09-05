"""AI provider interface.

The system must never be tightly coupled to a single AI vendor. Every provider
(mock, or the organiser-provided hackathon Bedrock API) implements this
interface. Business logic depends only on ``AIProvider`` and the structured
result contract, never on a concrete vendor SDK or request format.
"""

from abc import ABC, abstractmethod
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from app.schemas.ai_result import AIAnalysisResult
from app.schemas.insight import InsightClassification


@dataclass
class SignalInput:
    """Provider-agnostic view of a CustomerSignal passed to the model.

    Uses a string ``id`` so the returned ``evidence_signal_ids`` can be matched
    back regardless of how the caller identifies signals.
    """

    id: str
    text: str
    context: dict[str, Any] = field(default_factory=dict)


class AIProvider(ABC):
    """Abstract contract every AI provider must satisfy."""

    #: Short identifier, e.g. "mock", "hackathon".
    name: str = "base"

    @abstractmethod
    def analyze_signals(self, signals: Sequence[SignalInput]) -> AIAnalysisResult:
        """Analyse a set of customer signals into structured, validated insights.

        Implementations must return an :class:`AIAnalysisResult` whose insights
        obey the strict contract: valid category, confidence in [0, 1], and at
        least one ``evidence_signal_id`` that corresponds to one of the supplied
        signals. Providers should validate their own output before returning.
        """
        raise NotImplementedError

    def classify_feedback(self, content: str) -> list[InsightClassification]:
        """Legacy per-feedback classification.

        Retained for backward compatibility with the existing insight engine.
        New code should prefer :meth:`analyze_signals`. Not every provider needs
        to implement this.
        """
        raise NotImplementedError

    def health(self) -> bool:
        """Return True if the provider is ready to serve requests."""
        return True
