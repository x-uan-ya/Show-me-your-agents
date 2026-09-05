"""Ingestion request/response schemas."""

from typing import Any

from pydantic import BaseModel, Field


class UploadResponse(BaseModel):
    dataset_id: int
    columns: list[str]
    sample_rows: list[dict[str, Any]]
    suggested_mapping: dict[str, str]


class ConfirmMappingRequest(BaseModel):
    # canonical field -> source column name
    mapping: dict[str, str] = Field(..., min_length=1)


class ImportResultResponse(BaseModel):
    imported: int
    skipped: int
    errors: list[dict[str, Any]]
