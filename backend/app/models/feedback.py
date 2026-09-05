"""Feedback ORM model.

A FeedbackItem is a single unit of raw customer feedback. The source is kept as
a free-form string so the model stays data-source-independent until a real
dataset/SME is confirmed.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class FeedbackItem(Base):
    __tablename__ = "feedback_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Where the feedback came from, e.g. "survey", "review", "support_ticket".
    source: Mapped[str] = mapped_column(String(128), default="unknown")
    # Optional external identifier from the originating system.
    external_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    insights: Mapped[list["Insight"]] = relationship(  # noqa: F821
        back_populates="feedback_item",
        cascade="all, delete-orphan",
    )
