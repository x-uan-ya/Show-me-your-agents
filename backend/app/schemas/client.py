"""Client schemas."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    industry: str | None = Field(default=None, max_length=128)
    description: str | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    industry: str | None
    description: str | None
    created_at: datetime
    updated_at: datetime
