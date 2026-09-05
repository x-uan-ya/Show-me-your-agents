"""Validation of AI provider output.

AI output is untrusted: it may be malformed, contain invalid categories,
out-of-range confidence, missing evidence, or reference signal ids that were
never supplied. This module turns arbitrary raw output into a clean, validated
:class:`AIAnalysisResult` without ever raising on bad input. Rejected insights
are reported so callers can log/inspect them, but they never crash the app.
"""

from __future__ import annotations

import json
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.schemas.ai_result import AIAnalysisResult, AIInsight


@dataclass
class ValidationOutcome:
    """Result of validating raw AI output."""

    result: AIAnalysisResult
    #: Human-readable reasons individual insights were rejected.
    rejected: list[str] = field(default_factory=list)


def _coerce_to_dict(raw: Any) -> dict[str, Any] | None:
    """Best-effort coercion of raw output into a dict. Returns None on failure."""
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, (str, bytes, bytearray)):
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def validate_ai_output(
    raw: Any, supplied_signal_ids: Iterable[str]
) -> ValidationOutcome:
    """Validate arbitrary raw AI output against the strict contract.

    Every insight is checked individually. An insight is kept only if it:
    - parses against the :class:`AIInsight` schema (valid category, confidence
      in [0, 1], at least one evidence id, non-empty title/summary), and
    - references only signal ids that were actually supplied to the model.

    Malformed top-level output yields an empty result plus a rejection note; it
    never raises.
    """
    allowed_ids = set(supplied_signal_ids)
    rejected: list[str] = []

    data = _coerce_to_dict(raw)
    if data is None:
        return ValidationOutcome(
            result=AIAnalysisResult(insights=[]),
            rejected=["Top-level output was not a JSON object."],
        )

    raw_insights = data.get("insights")
    if not isinstance(raw_insights, list):
        return ValidationOutcome(
            result=AIAnalysisResult(insights=[]),
            rejected=["'insights' was missing or not a list."],
        )

    kept: list[AIInsight] = []
    for index, item in enumerate(raw_insights):
        if not isinstance(item, dict):
            rejected.append(f"Insight #{index} was not an object.")
            continue

        try:
            insight = AIInsight.model_validate(item)
        except ValidationError as exc:
            reasons = "; ".join(e.get("msg", "invalid") for e in exc.errors())
            rejected.append(f"Insight #{index} failed schema validation: {reasons}")
            continue

        # Cross-check: every evidence id must be one of the supplied signals.
        unknown = [sid for sid in insight.evidence_signal_ids if sid not in allowed_ids]
        if unknown:
            rejected.append(
                f"Insight #{index} references unknown signal id(s): {', '.join(unknown)}."
            )
            continue

        kept.append(insight)

    return ValidationOutcome(result=AIAnalysisResult(insights=kept), rejected=rejected)
