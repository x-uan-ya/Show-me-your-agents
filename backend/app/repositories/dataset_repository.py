"""Dataset repository: data-access for Dataset and its CustomerSignals."""

from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session

from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset

if TYPE_CHECKING:
    from app.services.ingestion.normalise import NormalisedRow


class DatasetRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(
        self,
        *,
        client_id: int,
        name: str,
        source_type: str,
        filename: str | None,
        columns: list[str],
        rows: list[dict[str, Any]],
    ) -> Dataset:
        dataset = Dataset(
            client_id=client_id,
            name=name,
            source_type=source_type,
            filename=filename,
            record_count=len(rows),
            status="awaiting_mapping",
            pending_columns=columns,
            pending_rows=rows,
        )
        self._db.add(dataset)
        self._db.commit()
        self._db.refresh(dataset)
        return dataset

    def get(self, dataset_id: int) -> Dataset | None:
        return self._db.get(Dataset, dataset_id)

    def store_signals(
        self, dataset: Dataset, normalised: "list[NormalisedRow]"
    ) -> int:
        signals = [
            CustomerSignal(
                client_id=dataset.client_id,
                dataset_id=dataset.id,
                external_id=row.external_id,
                source=row.source,
                date=row.date,
                text=row.text,
                rating=row.rating,
                product=row.product,
                campaign=row.campaign,
                channel=row.channel,
                signal_metadata=row.metadata,
            )
            for row in normalised
        ]
        self._db.add_all(signals)
        # Mapping confirmed: mark ready, clear the staging area, set final count.
        dataset.status = "ready"
        dataset.record_count = len(signals)
        dataset.pending_rows = None
        self._db.commit()
        return len(signals)
