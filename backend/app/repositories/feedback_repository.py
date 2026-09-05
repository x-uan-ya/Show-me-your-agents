"""Feedback repository: data-access layer for FeedbackItem."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.feedback import FeedbackItem
from app.schemas.feedback import FeedbackCreate


class FeedbackRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, payload: FeedbackCreate) -> FeedbackItem:
        item = FeedbackItem(
            content=payload.content,
            source=payload.source,
            external_id=payload.external_id,
        )
        self._db.add(item)
        self._db.commit()
        self._db.refresh(item)
        return item

    def get(self, feedback_id: int) -> FeedbackItem | None:
        return self._db.get(FeedbackItem, feedback_id)

    def list(self) -> list[FeedbackItem]:
        return list(self._db.scalars(select(FeedbackItem)).all())
