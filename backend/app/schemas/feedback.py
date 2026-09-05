"""Feedback schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    content: str = Field(..., min_length=1, description="Raw customer feedback text.")
    source: str = Field(default="unknown", description="Origin of the feedback.")
    external_id: str | None = Field(default=None, description="Optional external id.")


class FeedbackRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    external_id: str | None
    content: str
    created_at: datetime
