"""Persisted campaign and schedule/content item models."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.database import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    client_id: Mapped[int] = mapped_column(
        ForeignKey("clients.id", ondelete="CASCADE"), index=True
    )
    marketing_brief_id: Mapped[int] = mapped_column(
        ForeignKey("marketing_briefs.id", ondelete="RESTRICT"), index=True
    )
    analysis_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("analysis_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    primary_insight_id: Mapped[int | None] = mapped_column(
        ForeignKey("customer_insights.id", ondelete="SET NULL"), nullable=True, index=True
    )
    supporting_insight_ids: Mapped[list[int]] = mapped_column(JSON, default=list)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    objective: Mapped[str] = mapped_column(Text, nullable=False)
    target_audience: Mapped[str] = mapped_column(Text, nullable=False)
    key_message: Mapped[str] = mapped_column(Text, nullable=False)
    message_gap: Mapped[str | None] = mapped_column(Text, nullable=True)
    cta: Mapped[str] = mapped_column(Text, nullable=False)
    kpi: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    # Flexible AI reasoning details supplement, rather than replace, the
    # queryable campaign/message/status/date columns above.
    strategy_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped[Client] = relationship(back_populates="campaigns")  # noqa: F821
    marketing_brief: Mapped[MarketingBrief] = relationship(  # noqa: F821
        back_populates="campaigns"
    )
    analysis_run: Mapped[AnalysisRun | None] = relationship()  # noqa: F821
    primary_insight: Mapped[CustomerInsight | None] = relationship()  # noqa: F821
    content_items: Mapped[list[CampaignContentItem]] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
        order_by="CampaignContentItem.sequence_day, CampaignContentItem.id",
    )
    approval: Mapped[CampaignApproval | None] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
        uselist=False,
    )


class CampaignContentItem(Base):
    __tablename__ = "campaign_content_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    cta: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    publish_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    owner: Mapped[str | None] = mapped_column(String(256), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="draft", index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    campaign: Mapped[Campaign] = relationship(back_populates="content_items")


class CampaignApproval(Base):
    __tablename__ = "campaign_approvals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), unique=True, index=True
    )
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    reviewer: Mapped[str | None] = mapped_column(String(256), nullable=True)
    revision_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    campaign: Mapped[Campaign] = relationship(back_populates="approval")
