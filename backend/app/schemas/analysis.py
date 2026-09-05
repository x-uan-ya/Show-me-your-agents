"""Analysis request/response schemas.

These describe the customer-understanding analysis flow only. No campaign,
message, calendar, or scheduling concepts appear here by design.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.utils.categories import InsightCategory


class AnalyseRequest(BaseModel):
    # Accepts int or numeric string; datasets use integer PKs.
    dataset_id: int = Field(..., description="Dataset to analyse (must belong to client).")


class EvidenceRead(BaseModel):
    signal_id: int
    excerpt: str
    relevance_score: float | None = None


class InsightRead(BaseModel):
    id: int
    client_id: int
    analysis_run_id: int
    title: str
    summary: str
    category: InsightCategory
    confidence: float = Field(..., description="Stored 0-1; not a probability.")
    confidence_label: str = Field(..., description="Qualitative band: High/Medium/Low.")
    evidence_count: int
    reasoning_summary: str | None
    evidence: list[EvidenceRead]


class AnalysisRunRead(BaseModel):
    id: int
    client_id: int
    dataset_id: int
    status: str
    model_provider: str
    model_name: str | None
    started_at: datetime
    completed_at: datetime | None
    error_message: str | None


class AnalyseResponse(BaseModel):
    analysis_run: AnalysisRunRead
    insights: list[InsightRead]
    #: Non-fatal notes about insights that were rejected during validation.
    rejected: list[str] = Field(default_factory=list)
