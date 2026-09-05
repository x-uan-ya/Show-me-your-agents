"""Row normalisation for confirmed mappings.

Given a confirmed mapping (canonical field -> source column) and parsed rows,
produce normalised records ready to persist as CustomerSignal, plus a report of
skipped/errored rows. Customer text is preserved as-is aside from trimming
surrounding whitespace; we never rewrite the content itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.services.ingestion.schema import CANONICAL_FIELDS, REQUIRED_FIELDS

# Date formats we attempt, in order. Parsing is best-effort and never fatal.
_DATE_FORMATS: tuple[str, ...] = (
    "%Y-%m-%d",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
    "%d/%m/%Y",
    "%m/%d/%Y",
    "%d-%m-%Y",
)


@dataclass
class NormalisedRow:
    text: str
    external_id: str | None = None
    date: datetime | None = None
    rating: float | None = None
    product: str | None = None
    campaign: str | None = None
    channel: str | None = None
    source: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class ImportReport:
    imported: int = 0
    skipped: int = 0
    errors: list[dict[str, Any]] = field(default_factory=list)


def parse_date_safe(value: str) -> tuple[datetime | None, bool]:
    """Return (parsed_date, had_error). Empty input is not an error."""
    value = value.strip()
    if not value:
        return None, False
    # Try ISO first (handles many variants), then explicit formats.
    try:
        return datetime.fromisoformat(value), False
    except ValueError:
        pass
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt), False
        except ValueError:
            continue
    return None, True


def parse_rating_safe(value: str) -> tuple[float | None, bool]:
    """Return (parsed_rating, had_error). Empty input is not an error."""
    value = value.strip()
    if not value:
        return None, False
    try:
        return float(value), False
    except ValueError:
        return None, True


def _clean_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def normalise_rows(
    rows: list[dict[str, str]], mapping: dict[str, str]
) -> tuple[list[NormalisedRow], ImportReport]:
    """Normalise parsed rows using a confirmed mapping.

    Rows with empty/missing text are skipped. Malformed dates/ratings do not
    drop the row; the offending value is discarded, the row is still imported,
    and a non-fatal error is recorded. Source columns not present in the mapping
    are preserved verbatim in ``metadata``.
    """
    text_column = mapping.get("text")
    report = ImportReport()
    result: list[NormalisedRow] = []

    # Reverse map: source column -> canonical field, for detecting unknown cols.
    mapped_source_columns = {
        col for fld, col in mapping.items() if fld in CANONICAL_FIELDS
    }

    for index, row in enumerate(rows):
        row_number = index + 1  # human-friendly (1-based, excludes header)

        raw_text = row.get(text_column, "") if text_column else ""
        text = raw_text.strip()
        if not text:
            report.skipped += 1
            continue

        normalised = NormalisedRow(text=text)
        row_errors: list[str] = []

        if col := mapping.get("external_id"):
            normalised.external_id = _clean_optional(row.get(col))
        if col := mapping.get("product"):
            normalised.product = _clean_optional(row.get(col))
        if col := mapping.get("campaign"):
            normalised.campaign = _clean_optional(row.get(col))
        if col := mapping.get("channel"):
            normalised.channel = _clean_optional(row.get(col))
        if col := mapping.get("source"):
            normalised.source = _clean_optional(row.get(col))

        if col := mapping.get("date"):
            parsed_date, date_error = parse_date_safe(row.get(col, ""))
            normalised.date = parsed_date
            if date_error:
                row_errors.append(f"Unparseable date in column '{col}'.")

        if col := mapping.get("rating"):
            parsed_rating, rating_error = parse_rating_safe(row.get(col, ""))
            normalised.rating = parsed_rating
            if rating_error:
                row_errors.append(f"Unparseable rating in column '{col}'.")

        # Preserve any source columns not part of the confirmed mapping.
        metadata = {
            key: value
            for key, value in row.items()
            if key not in mapped_source_columns
        }
        normalised.metadata = metadata

        result.append(normalised)
        report.imported += 1
        if row_errors:
            report.errors.append({"row": row_number, "issues": row_errors})

    return result, report


def missing_required_fields(mapping: dict[str, str]) -> list[str]:
    """Return required canonical fields absent from the mapping."""
    return [f for f in REQUIRED_FIELDS if not mapping.get(f)]
