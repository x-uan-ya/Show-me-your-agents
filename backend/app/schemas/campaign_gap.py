"""Contracts for Dataset 3 customer-message gap detection."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CampaignParameterRead(BaseModel):
    campaign_id: str
    objective: str
    target_audience: str
    active_message: str
    channel: str


class CampaignGapRequest(BaseModel):
    campaign_id: str = Field(..., min_length=1, max_length=100)


class CampaignGapAutoRequest(BaseModel):
    objective: str = Field(..., min_length=1, max_length=500)
    target_audience: str = Field(..., min_length=1, max_length=500)
    active_message: str = Field(default="", max_length=2000)
    channels: list[str] = Field(..., min_length=1, max_length=20)


class CampaignGapAnalysis(BaseModel):
    alignment: Literal["aligned", "partial", "misaligned"]
    summary: str = Field(..., min_length=1, max_length=600)
    matched_customer_values: list[str] = Field(default_factory=list, max_length=5)
    message_gaps: list[str] = Field(default_factory=list, max_length=5)
    recommended_actions: list[str] = Field(default_factory=list, max_length=5)
    supporting_insight_ids: list[int] = Field(default_factory=list, max_length=8)


class CampaignGapResponse(BaseModel):
    client_id: int
    campaign: CampaignParameterRead
    analysis: CampaignGapAnalysis
