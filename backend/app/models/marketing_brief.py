"""Persisted marketing brief for one client.

The current product edits one active brief per SME. Keeping this relationship
one-to-one avoids accumulating a new database row for every autosaved field
change while still giving campaigns a stable brief foreign key.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class MarketingBrief(Base):
    __tablename__ = "marketing_briefs"
    __table_args__ = (UniqueConstraint("client_id", name="uq_marketing_briefs_client_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    objective: Mapped[str] = mapped_column(Text, default="")
    target_audience: Mapped[str] = mapped_column(Text, default="")
    current_message: Mapped[str] = mapped_column(Text, default="")
    channels: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped["Client"] = relationship(back_populates="marketing_brief")  # noqa: F821
    campaigns: Mapped[list["Campaign"]] = relationship(  # noqa: F821
        back_populates="marketing_brief"
    )
