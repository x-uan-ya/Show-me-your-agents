"""Handoff API schemas: structured Customer Insight Intelligence context.

This is the contract downstream components integrate against. It exposes only
validated, evidence-backed customer understanding. It intentionally contains NO
campaign objectives, marketing recommendations, ideas, content, calendars, or
publishing schedules.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.utils.categories import InsightCategory


class InsightEvidenceQuality(BaseModel):
    """Compact evidence-quality summary attached to each handoff insight."""

    status: str = Field(..., description="OK | CAUTION | INSUFFICIENT.")
    flags: list[str] = Field(
        default_factory=list,
        description="Evidence-quality flags, e.g. LIMITED_EVIDENCE, SMALL_SAMPLE.",
    )


class ContextInsight(BaseModel):
    """A single validated insight in the handoff payload."""

    insight_id: int
    category: InsightCategory
    title: str
    summary: str
    confidence: float = Field(..., description="Stored 0-1; not a probability.")
    confidence_label: str = Field(..., description="High | Medium | Low.")
    evidence_count: int
    evidence_quality: InsightEvidenceQuality
    supporting_evidence_ids: list[int] = Field(
        default_factory=list,
        description="CustomerSignal ids that support this insight.",
    )


class DataQuality(BaseModel):
    """Dataset-level quality summary for the analysed snapshot."""

    dataset_signal_count: int = Field(
        ..., description="Number of customer signals in the analysed dataset."
    )
    total_insights: int
    insights_with_caution: int = Field(
        ..., description="Insights whose evidence quality is not OK."
    )
    small_sample: bool = Field(
        ..., description="True if the analysed dataset is below the sample threshold."
    )


class InsightContext(BaseModel):
    """The full handoff envelope, grouped by behavioural category."""

    client_id: int
    analysis_run_id: int | None = Field(
        None, description="Latest completed analysis run, or null if none exists."
    )
    dataset_id: int | None = None
    generated_at: datetime | None = Field(
        None, description="When the analysis run completed, or null if none exists."
    )

    purchase_drivers: list[ContextInsight] = Field(default_factory=list)
    trial_drivers: list[ContextInsight] = Field(default_factory=list)
    retention_drivers: list[ContextInsight] = Field(default_factory=list)
    non_repeat_drivers: list[ContextInsight] = Field(default_factory=list)
    pain_points: list[ContextInsight] = Field(default_factory=list)
    unmet_needs: list[ContextInsight] = Field(default_factory=list)
    customer_anxieties: list[ContextInsight] = Field(default_factory=list)
    emerging_demand: list[ContextInsight] = Field(default_factory=list)

    data_quality: DataQuality | None = None
    limitations: list[str] = Field(default_factory=list)
