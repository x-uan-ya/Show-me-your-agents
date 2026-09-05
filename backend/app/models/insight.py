"""Insight ORM model.

An Insight is a classified, evidence-backed observation derived from feedback.
It references the source feedback and stores the supporting evidence excerpt so
every insight remains traceable.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    feedback_id: Mapped[int] = mapped_column(
        ForeignKey("feedback_items.id", ondelete="CASCADE"), index=True
    )
    # Stored as the InsightType value (string) to keep the schema portable.
    insight_type: Mapped[str] = mapped_column(String(64), index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # Verbatim excerpt from the feedback that supports this insight.
    evidence: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    feedback_item: Mapped["FeedbackItem"] = relationship(  # noqa: F821
        back_populates="insights"
    )
