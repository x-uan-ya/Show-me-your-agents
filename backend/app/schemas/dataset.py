"""Dataset schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DatasetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    client_id: int
    name: str
    source_type: str
    filename: str | None
    record_count: int
    uploaded_at: datetime
    status: str


class DatasetCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    source_type: str = Field(..., min_length=1, max_length=64)
    filename: str | None = Field(default=None, max_length=512)
    record_count: int = Field(default=0, ge=0)
    status: str = Field(default="pending", max_length=32)
