"""Evidence-quality assessment schemas.

Describes how well-supported a single CustomerInsight is. This is a transparency
aid, not a downstream recommendation: it reports what the evidence does and does
not support, and never fabricates precision.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class EvidenceFlag(str, Enum):
    LIMITED_EVIDENCE = "LIMITED_EVIDENCE"
    SMALL_SAMPLE = "SMALL_SAMPLE"
    SOURCE_CONCENTRATION = "SOURCE_CONCENTRATION"
    CONFLICTING_SIGNALS = "CONFLICTING_SIGNALS"
    LIMITED_CONTEXT = "LIMITED_CONTEXT"


class EvidenceQualityStatus(str, Enum):
    # No flags raised: the evidence has no obvious quality concerns.
    OK = "OK"
    # One or more flags: interpret with care.
    CAUTION = "CAUTION"
    # Serious concern (e.g. no independent evidence at all).
    INSUFFICIENT = "INSUFFICIENT"


class EvidenceQuality(BaseModel):
    insight_id: int
    status: EvidenceQualityStatus
    confidence: float = Field(..., description="Stored 0-1; not a probability.")
    confidence_label: str
    evidence_count: int = Field(..., description="Number of supporting signals.")
    #: Independent (distinct) supporting signals.
    independent_evidence_count: int
    #: Coverage of the analysed dataset, where meaningful (0-1), else null.
    evidence_coverage: float | None = None
    #: Count of supporting evidence per source name.
    source_distribution: dict[str, int] = Field(default_factory=dict)
    flags: list[EvidenceFlag] = Field(default_factory=list)
    explanation: str
    #: Data-derived limitations (never freely invented by an AI).
    limitations: list[str] = Field(default_factory=list)
