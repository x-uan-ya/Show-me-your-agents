"""Dataset ingestion router.

Two endpoints implement the adaptive CSV ingestion flow:

- ``POST /api/clients/{client_id}/datasets/upload`` inspects an uploaded file
  and returns detected columns, sample rows and a suggested mapping.
- ``POST /api/clients/{client_id}/datasets/{dataset_id}/confirm-mapping``
  validates the confirmed mapping, normalises staged rows and stores
  CustomerSignal records.

Security: both routes are scoped by ``client_id`` and verify that the dataset
belongs to that client before doing any work (client isolation). Only known
file extensions/content types are accepted, a development file-size limit is
enforced, and uploaded content is never executed. All customer text is treated
as untrusted data.
"""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.client_repository import ClientRepository
from app.repositories.dataset_repository import DatasetRepository
from app.schemas.ingestion import (
    ConfirmMappingRequest,
    ImportResultResponse,
    UploadResponse,
)
from app.services.ingestion.csv_ingestion import CsvIngestionService
from app.services.ingestion.readers import IngestionError

# Development file-size limit (5 MB). Kept modest on purpose for the hackathon.
MAX_UPLOAD_BYTES = 5 * 1024 * 1024

# Accepted file signals. We only support CSV for now.
_ALLOWED_EXTENSIONS = (".csv",)
_ALLOWED_CONTENT_TYPES = (
    "text/csv",
    "application/csv",
    "application/vnd.ms-excel",  # some browsers label CSV this way
    "text/plain",
    "application/octet-stream",
)

clients_datasets_router = APIRouter(prefix="/clients", tags=["ingestion"])


def _reject(message: str, code: int = status.HTTP_400_BAD_REQUEST):
    raise HTTPException(status_code=code, detail=message)


@clients_datasets_router.post(
    "/{client_id}/datasets/upload",
    response_model=UploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    client_id: int,
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> UploadResponse:
    if ClientRepository(db).get(client_id) is None:
        _reject(f"Client {client_id} not found", status.HTTP_404_NOT_FOUND)

    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(_ALLOWED_EXTENSIONS):
        _reject("Only .csv files are supported.")
    if file.content_type and file.content_type not in _ALLOWED_CONTENT_TYPES:
        _reject(f"Unsupported content type: {file.content_type}")

    raw = await file.read()
    if len(raw) == 0:
        _reject("Uploaded file is empty.")
    if len(raw) > MAX_UPLOAD_BYTES:
        _reject(
            f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit.",
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    service = CsvIngestionService(db)
    try:
        result = service.inspect_and_stage(
            client_id=client_id,
            name=name or filename,
            filename=filename,
            raw=raw,
            source_type="csv",
        )
    except IngestionError as exc:
        _reject(str(exc))

    return UploadResponse(
        dataset_id=result.dataset_id,
        columns=result.columns,
        sample_rows=result.sample_rows,
        suggested_mapping=result.suggested_mapping,
    )


@clients_datasets_router.post(
    "/{client_id}/datasets/{dataset_id}/confirm-mapping",
    response_model=ImportResultResponse,
)
def confirm_mapping(
    client_id: int,
    dataset_id: int,
    payload: ConfirmMappingRequest,
    db: Session = Depends(get_db),
) -> ImportResultResponse:
    if ClientRepository(db).get(client_id) is None:
        _reject(f"Client {client_id} not found", status.HTTP_404_NOT_FOUND)

    # Client isolation: only operate on a dataset owned by this client.
    dataset = DatasetRepository(db).get_for_client(dataset_id, client_id)
    if dataset is None:
        _reject(
            f"Dataset {dataset_id} not found for client {client_id}",
            status.HTTP_404_NOT_FOUND,
        )

    service = CsvIngestionService(db)
    try:
        report = service.confirm_mapping(dataset, payload.mapping)
    except IngestionError as exc:
        _reject(str(exc))

    return ImportResultResponse(
        imported=report.imported, skipped=report.skipped, errors=report.errors
    )
