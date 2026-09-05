"""Insight repository: data-access layer for Insight."""

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.insight import Insight
from app.schemas.insight import InsightClassification


class InsightRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def bulk_create(
        self, feedback_id: int, classifications: Iterable[InsightClassification]
    ) -> list[Insight]:
        insights = [
            Insight(
                feedback_id=feedback_id,
                insight_type=c.insight_type.value,
                summary=c.summary,
                evidence=c.evidence,
                confidence=c.confidence,
            )
            for c in classifications
        ]
        self._db.add_all(insights)
        self._db.commit()
        for insight in insights:
            self._db.refresh(insight)
        return insights

    def list(self) -> list[Insight]:
        return list(self._db.scalars(select(Insight)).all())
