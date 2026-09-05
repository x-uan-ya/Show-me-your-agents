"""CSV ingestion service.

Orchestrates the adaptive ingestion flow for CustomerSignal data:

    upload -> inspect columns -> suggest mapping
                                       |
                              (user confirms mapping)
                                       |
                     validate -> normalise -> store CustomerSignals

The reader is chosen via the reader registry, so this service is not locked to
CSV: an Excel or JSON reader can be added without changing the flow.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.repositories.dataset_repository import DatasetRepository
from app.services.ingestion.normalise import (
    ImportReport,
    missing_required_fields,
    normalise_rows,
)
from app.services.ingestion.readers import IngestionError, get_reader
from app.services.ingestion.schema import suggest_mapping

# Number of sample rows returned to the UI for preview.
SAMPLE_ROW_COUNT = 5


@dataclass
class UploadResult:
    dataset_id: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    suggested_mapping: dict[str, str]


class CsvIngestionService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._repo = DatasetRepository(db)

    def inspect_and_stage(
        self,
        *,
        client_id: int,
        name: str,
        filename: str | None,
        raw: bytes,
        source_type: str = "csv",
    ) -> UploadResult:
        """Parse the upload, stage rows, and return columns + suggestions.

        Raises :class:`IngestionError` for unreadable content.
        """
        reader = get_reader(source_type)
        table = reader.read(raw)

        dataset = self._repo.create(
            client_id=client_id,
            name=name,
            source_type=source_type,
            filename=filename,
            columns=table.columns,
            rows=table.rows,
        )

        return UploadResult(
            dataset_id=dataset.id,
            columns=table.columns,
            sample_rows=table.rows[:SAMPLE_ROW_COUNT],
            suggested_mapping=suggest_mapping(table.columns),
        )

    def confirm_mapping(
        self, dataset: Dataset, mapping: dict[str, str]
    ) -> ImportReport:
        """Validate the mapping, normalise staged rows, and store signals.

        Raises :class:`IngestionError` if the mapping is invalid or if there is
        nothing staged to import.
        """
        missing = missing_required_fields(mapping)
        if missing:
            raise IngestionError(
                f"Mapping is missing required field(s): {', '.join(missing)}."
            )

        columns = dataset.pending_columns or []
        unknown = [col for col in mapping.values() if col not in columns]
        if unknown:
            raise IngestionError(
                f"Mapping references unknown column(s): {', '.join(unknown)}."
            )

        rows = dataset.pending_rows
        if rows is None:
            raise IngestionError(
                "No staged rows to import. The dataset may already be imported."
            )

        normalised, report = normalise_rows(rows, mapping)
        self._repo.store_signals(dataset, normalised)
        return report
