"""Insight schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.utils.taxonomy import InsightType


class InsightTypeInfo(BaseModel):
    """Serializable description of a single taxonomy entry."""

    type: str
    label: str
    question: str
    description: str


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    feedback_id: int
    insight_type: InsightType
    summary: str
    evidence: str
    confidence: float
    created_at: datetime


class InsightClassification(BaseModel):
    """A single classification result returned by an AI provider (pre-persistence)."""

    insight_type: InsightType
    summary: str
    evidence: str = Field(..., description="Verbatim excerpt supporting the insight.")
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
