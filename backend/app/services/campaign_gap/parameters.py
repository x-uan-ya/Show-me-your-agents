"""Validated campaign inputs for future customer-message gap detection.

Campaign parameters describe what a business is currently trying to achieve
and communicate. They are configuration inputs, not customer evidence, so they
must not pass through the CustomerSignal ingestion pipeline.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

REQUIRED_FIELDS: tuple[str, ...] = (
    "campaign_id",
    "objective",
    "target_audience",
    "active_message",
    "channel",
)

DEFAULT_CAMPAIGN_PARAMETERS_PATH = (
    Path(__file__).resolve().parents[3]
    / "data"
    / "inference"
    / "dataset3_marketing_campaign_parameters.csv"
)


class CampaignParameterError(ValueError):
    """Raised when campaign parameter data does not satisfy its input contract."""


@dataclass(frozen=True)
class CampaignParameters:
    campaign_id: str
    objective: str
    target_audience: str
    active_message: str
    channel: str


def load_campaign_parameters_csv(
    path: str | Path = DEFAULT_CAMPAIGN_PARAMETERS_PATH,
) -> list[CampaignParameters]:
    """Load and validate campaign parameters from a UTF-8 CSV file.

    Every required value must be non-empty and campaign ids must be unique.
    ``utf-8-sig`` accepts both ordinary UTF-8 and files exported with a BOM.
    """
    source = Path(path)
    try:
        handle = source.open(encoding="utf-8-sig", newline="")
    except (OSError, UnicodeError) as exc:
        raise CampaignParameterError(
            f"Could not read campaign parameters from {source}."
        ) from exc

    with handle:
        reader = csv.DictReader(handle)
        columns = tuple(reader.fieldnames or ())
        missing_columns = [field for field in REQUIRED_FIELDS if field not in columns]
        if missing_columns:
            raise CampaignParameterError(
                "Missing required campaign parameter column(s): "
                + ", ".join(missing_columns)
            )

        records: list[CampaignParameters] = []
        seen_campaign_ids: set[str] = set()

        for row_number, row in enumerate(reader, start=2):
            values = {
                field: (row.get(field) or "").strip() for field in REQUIRED_FIELDS
            }
            missing_values = [field for field, value in values.items() if not value]
            if missing_values:
                raise CampaignParameterError(
                    f"Row {row_number} has empty required field(s): "
                    + ", ".join(missing_values)
                )

            campaign_id = values["campaign_id"]
            if campaign_id in seen_campaign_ids:
                raise CampaignParameterError(
                    f"Row {row_number} has duplicate campaign_id {campaign_id!r}."
                )
            seen_campaign_ids.add(campaign_id)

            records.append(CampaignParameters(**values))

    if not records:
        raise CampaignParameterError("Campaign parameter file has no data rows.")

    return records
