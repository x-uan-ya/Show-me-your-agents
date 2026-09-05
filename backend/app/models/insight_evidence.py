"""InsightEvidence ORM model.

Links a CustomerInsight to the CustomerSignal that supports it, keeping the
excerpt used as evidence. This is what makes every insight traceable.
"""

from sqlalchemy import Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InsightEvidence(Base):
    __tablename__ = "insight_evidence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    insight_id: Mapped[int] = mapped_column(
        ForeignKey("customer_insights.id", ondelete="CASCADE"), index=True
    )
    signal_id: Mapped[int] = mapped_column(
        ForeignKey("customer_signals.id", ondelete="CASCADE"), index=True
    )
    relevance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)

    insight: Mapped["CustomerInsight"] = relationship(  # noqa: F821
        back_populates="evidence"
    )
    signal: Mapped["CustomerSignal"] = relationship(  # noqa: F821
        back_populates="evidence"
    )
