"""Client repository: data-access for Client and its owned records.

All lookups for owned records (datasets, signals, insights) are scoped by
``client_id`` so one client can never read another client's data.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.client import Client
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.schemas.client import ClientCreate


class ClientRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def create(self, payload: ClientCreate) -> Client:
        client = Client(
            name=payload.name,
            industry=payload.industry,
            description=payload.description,
        )
        self._db.add(client)
        self._db.commit()
        self._db.refresh(client)
        return client

    def get(self, client_id: int) -> Client | None:
        return self._db.get(Client, client_id)

    def list(self) -> list[Client]:
        return list(self._db.scalars(select(Client).order_by(Client.id)).all())

    def list_datasets(self, client_id: int) -> list[Dataset]:
        stmt = select(Dataset).where(Dataset.client_id == client_id).order_by(Dataset.id)
        return list(self._db.scalars(stmt).all())

    def list_signals(self, client_id: int) -> list[CustomerSignal]:
        stmt = (
            select(CustomerSignal)
            .where(CustomerSignal.client_id == client_id)
            .order_by(CustomerSignal.id)
        )
        return list(self._db.scalars(stmt).all())

    def list_insights(self, client_id: int) -> list[CustomerInsight]:
        stmt = (
            select(CustomerInsight)
            .where(CustomerInsight.client_id == client_id)
            .order_by(CustomerInsight.id)
        )
        return list(self._db.scalars(stmt).all())

    def insights_by_categories(
        self, client_id: int, categories: list[str]
    ) -> list[CustomerInsight]:
        """Load a client's insights in the given categories, evidence eager-loaded.

        Ordered by descending confidence so the strongest-supported drivers
        appear first. Evidence is loaded so callers can enforce the grounding
        rule (insights without evidence are excluded downstream).
        """
        stmt = (
            select(CustomerInsight)
            .where(
                CustomerInsight.client_id == client_id,
                CustomerInsight.category.in_(categories),
            )
            .options(selectinload(CustomerInsight.evidence))
            .order_by(CustomerInsight.confidence.desc(), CustomerInsight.id)
        )
        return list(self._db.scalars(stmt).all())
