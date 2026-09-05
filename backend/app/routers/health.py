"""Health router."""

from fastapi import APIRouter

from app.schemas.common import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    """Basic liveness check consumed by the frontend to confirm connectivity."""
    return HealthResponse(status="ok")
