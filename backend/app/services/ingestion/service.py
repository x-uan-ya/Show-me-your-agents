"""Ingestion service.

Responsible for accepting raw feedback and persisting it. Kept intentionally
generic: no assumptions about source format, dataset, or SME. Normalisation
hooks live here so future connectors (CSV, API, etc.) can plug in without
changing callers.
"""

from sqlalchemy.orm import Session

from app.repositories.feedback_repository import FeedbackRepository
from app.schemas.feedback import FeedbackCreate
from app.models.feedback import FeedbackItem


class IngestionService:
    def __init__(self, db: Session) -> None:
        self._repo = FeedbackRepository(db)

    def ingest(self, payload: FeedbackCreate) -> FeedbackItem:
        """Normalise and persist a single feedback item."""
        normalised = self._normalise(payload)
        return self._repo.create(normalised)

    def _normalise(self, payload: FeedbackCreate) -> FeedbackCreate:
        """Apply light, source-independent normalisation."""
        return FeedbackCreate(
            content=payload.content.strip(),
            source=payload.source.strip().lower() or "unknown",
            external_id=payload.external_id,
        )
