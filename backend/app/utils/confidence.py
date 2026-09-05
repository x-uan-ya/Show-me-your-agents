"""Confidence banding.

Confidence is stored internally as a float in [0, 1] but must be presented to
users as a qualitative band, not a scientific probability. Thresholds are
configurable via settings.

    >= high threshold          -> "High"
    >= medium (and < high)     -> "Medium"
    otherwise                  -> "Low"
"""

from __future__ import annotations

from app.config import get_settings


def confidence_label(
    confidence: float,
    *,
    high: float | None = None,
    medium: float | None = None,
) -> str:
    """Map a 0-1 confidence value onto a High/Medium/Low band.

    Thresholds default to the configured values but can be overridden (useful
    for tests). This is a display aid only and does not imply a probability.
    """
    settings = get_settings()
    high_threshold = settings.confidence_high_threshold if high is None else high
    medium_threshold = settings.confidence_medium_threshold if medium is None else medium

    if confidence >= high_threshold:
        return "High"
    if confidence >= medium_threshold:
        return "Medium"
    return "Low"
