"""Development-only evaluation endpoint.

Exposes the Customer Insight Intelligence evaluation report. It runs the suite
against synthetic data in an isolated in-memory database each time, so it is
reproducible and does not touch the real dev database. Disabled outside
development environments.
"""

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.eval.report import build_report

router = APIRouter(prefix="/eval", tags=["evaluation"])


@router.get("/report")
def evaluation_report() -> dict:
    """Run the evaluation suite and return measured results / targets / limitations."""
    settings = get_settings()
    if settings.environment.lower() not in {"development", "dev", "test"}:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, "Evaluation endpoint is development-only."
        )
    return build_report()
