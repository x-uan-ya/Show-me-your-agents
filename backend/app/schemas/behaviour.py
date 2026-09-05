"""Behaviour summary schemas (Trial vs Retention).

Describes a customer-understanding view built from existing evidence-backed
CustomerInsight records. It distinguishes why customers appear to *try* an
offering from why they appear to *continue* (or *not continue*). It deliberately
contains no campaign, message, or recommendation concepts, and never claims
repeat-purchase rates or percentages the dataset cannot support.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class BehaviourEvidence(BaseModel):
    signal_id: int
    excerpt: str


class BehaviourDriver(BaseModel):
    """One evidence-backed driver derived from a stored CustomerInsight."""

    insight_id: int
    title: str
    summary: str
    confidence: float = Field(..., description="Stored 0-1; not a probability.")
    confidence_label: str
    evidence_count: int
    evidence: list[BehaviourEvidence]


class BehaviourSummary(BaseModel):
    trial_drivers: list[BehaviourDriver] = Field(default_factory=list)
    retention_drivers: list[BehaviourDriver] = Field(default_factory=list)
    non_repeat_drivers: list[BehaviourDriver] = Field(default_factory=list)
    #: Neutral, non-causal notes about what the evidence does and does not show.
    observations: list[str] = Field(default_factory=list)
    #: Honest caveats about what qualitative feedback can and cannot establish.
    limitations: list[str] = Field(default_factory=list)
