"""Client schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    industry: str | None = Field(default=None, max_length=128)
    description: str | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    workspace_id: int | None
    name: str
    industry: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime


WorkflowNextStep = Literal[
    "brief",
    "data",
    "analysis",
    "campaign",
    "approval",
    "schedule",
    "complete",
]


class WorkflowStatusRead(BaseModel):
    """Persisted completion state for one client's campaign workflow."""

    client_id: int
    client_name: str
    client: bool = True
    brief: bool
    data: bool
    analysis: bool
    insights: bool
    campaign: bool
    approval: bool
    schedule: bool
    latest_dataset_id: int | None = None
    latest_analysis_run_id: int | None = None
    latest_campaign_id: int | None = None
    insight_count: int = 0
    scheduled_item_count: int = 0
    recommended_next_step: WorkflowNextStep
