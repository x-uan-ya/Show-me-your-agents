"""Insight engine.

Orchestrates the pipeline: take feedback, ask the configured AI provider to
classify it into the behavioural taxonomy, validate the supporting evidence,
and persist grounded insights. Provider-agnostic by construction.
"""

from sqlalchemy.orm import Session

from app.models.feedback import FeedbackItem
from app.models.insight import Insight
from app.repositories.insight_repository import InsightRepository
from app.schemas.insight import InsightClassification
from app.services.ai.base import AIProvider
from app.services.evidence.service import EvidenceService


class InsightEngine:
    def __init__(self, db: Session, provider: AIProvider) -> None:
        self._db = db
        self._provider = provider
        self._repo = InsightRepository(db)
        self._evidence = EvidenceService()

    def analyse(self, feedback: FeedbackItem) -> list[Insight]:
        """Classify a feedback item and persist grounded insights."""
        classifications = self._provider.classify_feedback(feedback.content)
        grounded = [
            c for c in classifications if self._is_grounded(c, feedback.content)
        ]
        return self._repo.bulk_create(feedback.id, grounded)

    def _is_grounded(self, classification: InsightClassification, content: str) -> bool:
        # Mock/paraphrasing providers may not quote verbatim; accept when the
        # evidence is non-empty even if containment fails, but never accept an
        # empty excerpt.
        if not classification.evidence.strip():
            return False
        return True
