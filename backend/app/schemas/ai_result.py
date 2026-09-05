"""Structured AI analysis result contract.

This is the strict contract every AI provider must return, regardless of vendor.
The organiser's hackathon API will ultimately produce this shape via AWS Bedrock
(Claude Sonnet 4.5); the mock provider produces it locally. Downstream code
depends only on this contract, never on a provider's raw output.

Expected JSON shape:

    {
      "insights": [
        {
          "title": "...",
          "summary": "...",
          "category": "RETENTION_DRIVER",
          "confidence": 0.82,
          "reasoning_summary": "...",
          "evidence_signal_ids": ["signal-id-1", "signal-id-2"]
        }
      ]
    }

Validation rules:
- ``category`` must be one of the eight allowed InsightCategory values.
- ``confidence`` must be between 0 and 1 inclusive.
- every insight must have at least one evidence_signal_id.
- every evidence id must correspond to a CustomerSignal supplied to the model
  (checked separately in :func:`validate_against_signals`, which has the set of
  supplied ids).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.utils.categories import InsightCategory


class AIInsight(BaseModel):
    """A single structured insight returned by an AI provider."""

    title: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    category: InsightCategory
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning_summary: str = Field(default="")
    evidence_signal_ids: list[str] = Field(..., min_length=1)


class AIAnalysisResult(BaseModel):
    """The full structured result: a list of insights."""

    insights: list[AIInsight] = Field(default_factory=list)
