"""Canonical ingestion schema and synonym-based mapping suggestion.

We do not know the SME's CSV layout in advance, so ingestion adapts to whatever
column names arrive. This module defines our canonical target fields and a
synonym table used to *suggest* a mapping from arbitrary source columns onto
those fields. Suggestions are only defaults; the user confirms or edits them.

Nothing here is CSV-specific: it operates on a list of column names, so the same
suggester works for Excel or JSON sources added later.
"""

from __future__ import annotations

# The only required canonical field is ``text`` (the customer feedback itself).
REQUIRED_FIELDS: tuple[str, ...] = ("text",)

OPTIONAL_FIELDS: tuple[str, ...] = (
    "external_id",
    "date",
    "rating",
    "product",
    "campaign",
    "channel",
    "source",
)

CANONICAL_FIELDS: tuple[str, ...] = REQUIRED_FIELDS + OPTIONAL_FIELDS

# Known synonyms per canonical field. Matching is case-insensitive and ignores
# separators, so "Review Text", "review_text" and "reviewtext" all match.
SYNONYMS: dict[str, tuple[str, ...]] = {
    "text": (
        "text",
        "feedback",
        "review",
        "review_text",
        "comment",
        "customer_comment",
        "message",
        "response",
        "content",
    ),
    "external_id": ("external_id", "id", "record_id", "row_id"),
    "rating": ("rating", "stars", "score"),
    "date": ("date", "review_date", "created_at", "timestamp"),
    "product": ("product", "product_name", "item", "item_name"),
    "campaign": ("campaign", "campaign_name"),
    "channel": ("channel", "marketing_channel"),
    "source": ("source", "platform"),
}


def _normalise_key(value: str) -> str:
    """Lowercase and strip non-alphanumeric characters for tolerant matching."""
    return "".join(ch for ch in value.lower() if ch.isalnum())


# Precompute a lookup from normalised synonym -> canonical field.
_SYNONYM_LOOKUP: dict[str, str] = {}
for _field, _names in SYNONYMS.items():
    for _name in _names:
        _SYNONYM_LOOKUP[_normalise_key(_name)] = _field


def suggest_mapping(columns: list[str]) -> dict[str, str]:
    """Suggest a mapping of canonical field -> source column.

    The first source column that matches a canonical field's synonyms wins. A
    source column is never assigned to more than one canonical field.
    """
    mapping: dict[str, str] = {}
    used_columns: set[str] = set()

    for column in columns:
        field = _SYNONYM_LOOKUP.get(_normalise_key(column))
        if field and field not in mapping and column not in used_columns:
            mapping[field] = column
            used_columns.add(column)

    return mapping
