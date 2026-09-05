"""CustomerInsight ORM model.

A CustomerInsight is a classified, evidence-backed finding produced by an
analysis run. It belongs to a client and references the run that created it.
The category is one of the allowed InsightCategory values.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CustomerInsight(Base):
    __tablename__ = "customer_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    analysis_run_id: Mapped[int] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    # Stored as the InsightCategory value (string) to keep the schema portable.
    category: Mapped[str] = mapped_column(String(64), index=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    reasoning_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    client: Mapped["Client"] = relationship(back_populates="insights")  # noqa: F821
    analysis_run: Mapped["AnalysisRun"] = relationship(  # noqa: F821
        back_populates="insights"
    )
    evidence: Mapped[list["InsightEvidence"]] = relationship(  # noqa: F821
        back_populates="insight", cascade="all, delete-orphan"
    )
