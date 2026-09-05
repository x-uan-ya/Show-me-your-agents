"""AnalysisRun ORM model.

An AnalysisRun records a single execution of the (future) insight analysis over
a client's dataset. It captures which model provider was used and the run's
lifecycle status. AI analysis itself is not implemented yet.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    # e.g. "pending", "running", "completed", "failed".
    status: Mapped[str] = mapped_column(String(32), default="pending")
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    model_provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model_name: Mapped[str | None] = mapped_column(String(128), nullable=True)

    client: Mapped["Client"] = relationship(back_populates="analysis_runs")  # noqa: F821
    dataset: Mapped["Dataset"] = relationship(back_populates="analysis_runs")  # noqa: F821
    insights: Mapped[list["CustomerInsight"]] = relationship(  # noqa: F821
        back_populates="analysis_run", cascade="all, delete-orphan"
    )
