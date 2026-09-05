"""CustomerSignal schemas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CustomerSignalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    client_id: int
    dataset_id: int
    external_id: str | None
    source: str | None
    date: datetime | None
    text: str
    rating: float | None
    product: str | None
    campaign: str | None
    channel: str | None
    # Maps from the ORM attribute ``signal_metadata`` (column "metadata").
    metadata: dict[str, Any] = Field(
        default_factory=dict, validation_alias="signal_metadata"
    )
    created_at: datetime
