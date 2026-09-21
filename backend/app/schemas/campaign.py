"""Schemas for persisted marketing briefs, campaigns and schedule items."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


CampaignStatus = Literal["draft", "approved", "revision_requested"]
ContentStatus = Literal["draft", "scheduled", "published", "cancelled"]


class MarketingBriefWrite(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    objective: str = Field(default="", max_length=2000)
    target_audience: str = Field(default="", max_length=4000)
    current_message: str = Field(default="", max_length=8000)
    channels: list[str] = Field(default_factory=list, max_length=32)

    @field_validator("channels")
    @classmethod
    def clean_channels(cls, channels: list[str]) -> list[str]:
        cleaned: list[str] = []
        for channel in channels:
            value = channel.strip()
            if not value:
                continue
            if len(value) > 128:
                raise ValueError("Channel names must be 128 characters or fewer")
            if value not in cleaned:
                cleaned.append(value)
        return cleaned


class MarketingBriefRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    objective: str
    target_audience: str
    current_message: str
    channels: list[str]
    created_at: datetime
    updated_at: datetime


class CampaignContentItemCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    channel: str = Field(..., min_length=1, max_length=128)
    content: str = Field(..., min_length=1, max_length=12000)
    content_type: str | None = Field(default=None, max_length=64)
    cta: str | None = Field(default=None, max_length=2000)
    sequence_day: int | None = Field(default=None, ge=1)
    publish_date: date | None = None
    owner: str | None = Field(default=None, max_length=256)
    status: ContentStatus = "draft"


class CampaignContentItemRead(CampaignContentItemCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: int
    created_at: datetime
    updated_at: datetime


class CampaignCalendarItemRead(BaseModel):
    """A dated content item with its campaign and client context."""

    id: int
    campaign_id: int
    campaign_name: str
    campaign_status: str
    client_id: int
    client_name: str
    channel: str
    publish_date: date
    status: ContentStatus
    content: str
    content_type: str | None
    cta: str | None
    owner: str | None


class CampaignApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    campaign_id: int
    status: str
    reviewer: str | None
    revision_comment: str | None
    decided_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CampaignPrimaryInsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    analysis_run_id: int
    title: str
    summary: str
    confidence: float
    evidence_count: int


class CampaignCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    marketing_brief_id: int = Field(..., ge=1)
    analysis_run_id: int | None = Field(default=None, ge=1)
    primary_insight_id: int | None = Field(default=None, ge=1)
    supporting_insight_ids: list[int] = Field(default_factory=list, max_length=128)
    name: str = Field(..., min_length=1, max_length=512)
    key_message: str = Field(..., min_length=1, max_length=12000)
    message_gap: str | None = Field(default=None, max_length=12000)
    cta: str = Field(..., min_length=1, max_length=2000)
    kpi: str = Field(..., min_length=1, max_length=4000)
    status: CampaignStatus = "draft"
    start_date: date | None = None
    end_date: date | None = None
    strategy_payload: dict[str, Any] = Field(default_factory=dict)
    content_items: list[CampaignContentItemCreate] = Field(..., min_length=1, max_length=128)

    @field_validator("supporting_insight_ids")
    @classmethod
    def deduplicate_insight_ids(cls, insight_ids: list[int]) -> list[int]:
        if any(insight_id < 1 for insight_id in insight_ids):
            raise ValueError("Supporting insight IDs must be positive integers")
        return list(dict.fromkeys(insight_ids))

    @model_validator(mode="after")
    def validate_dates(self) -> CampaignCreate:
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class CampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    marketing_brief_id: int
    analysis_run_id: int | None
    primary_insight_id: int | None
    supporting_insight_ids: list[int]
    primary_insight: CampaignPrimaryInsightRead | None
    name: str
    objective: str
    target_audience: str
    key_message: str
    message_gap: str | None
    cta: str
    kpi: str
    status: str
    start_date: date | None
    end_date: date | None
    strategy_payload: dict[str, Any]
    content_items: list[CampaignContentItemRead]
    approval: CampaignApprovalRead | None
    created_at: datetime
    updated_at: datetime


class CampaignStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    status: CampaignStatus
    reviewer: str | None = Field(default=None, max_length=256)
    revision_comment: str | None = Field(default=None, max_length=8000)
