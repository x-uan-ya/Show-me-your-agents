"""Client ORM model.

A Client is an SME whose customer feedback we analyse. The system supports
multiple clients; all client-owned records are scoped by ``client_id``.
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(128), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    datasets: Mapped[list["Dataset"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    signals: Mapped[list["CustomerSignal"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    insights: Mapped[list["CustomerInsight"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
    analysis_runs: Mapped[list["AnalysisRun"]] = relationship(  # noqa: F821
        back_populates="client", cascade="all, delete-orphan"
    )
