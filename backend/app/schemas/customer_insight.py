"""CustomerInsight schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.utils.categories import InsightCategory


class CustomerInsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    analysis_run_id: int
    title: str
    summary: str
    category: InsightCategory
    confidence: float
    evidence_count: int
    reasoning_summary: str | None
    created_at: datetime
