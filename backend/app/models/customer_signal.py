"""CustomerSignal ORM model.

A CustomerSignal is a single unit of raw customer feedback (a review, survey
answer, support message, etc.) belonging to a client and a dataset. The text is
untrusted input and is treated purely as data.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class CustomerSignal(Base):
    __tablename__ = "customer_signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    dataset_id: Mapped[int] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    external_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    source: Mapped[str | None] = mapped_column(String(128), nullable=True)
    date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    product: Mapped[str | None] = mapped_column(String(256), nullable=True)
    campaign: Mapped[str | None] = mapped_column(String(256), nullable=True)
    channel: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # Free-form structured extras kept as JSON so the model stays flexible.
    signal_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    client: Mapped["Client"] = relationship(back_populates="signals")  # noqa: F821
    dataset: Mapped["Dataset"] = relationship(back_populates="signals")  # noqa: F821
    evidence: Mapped[list["InsightEvidence"]] = relationship(  # noqa: F821
        back_populates="signal", cascade="all, delete-orphan"
    )
