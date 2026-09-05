"""Dataset ORM model.

A Dataset is a batch of customer signals uploaded for a client, e.g. a CSV of
reviews or survey responses.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    # e.g. "csv", "api", "manual".
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    # e.g. "pending", "ready", "failed".
    status: Mapped[str] = mapped_column(String(32), default="pending")

    client: Mapped["Client"] = relationship(back_populates="datasets")  # noqa: F821
    signals: Mapped[list["CustomerSignal"]] = relationship(  # noqa: F821
        back_populates="dataset", cascade="all, delete-orphan"
    )
    analysis_runs: Mapped[list["AnalysisRun"]] = relationship(  # noqa: F821
        back_populates="dataset", cascade="all, delete-orphan"
    )
