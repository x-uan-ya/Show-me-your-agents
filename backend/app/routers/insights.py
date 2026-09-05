"""Insight router.

Exposes the behavioural taxonomy (metadata) and per-insight evidence-quality
assessment. No dataset or SME is assumed for the taxonomy; the evidence-quality
endpoint reports how well-supported an existing insight is.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.evidence_quality import EvidenceQuality
from app.schemas.insight import InsightTypeInfo
from app.services.insight_engine.evidence_quality import (
    EvidenceQualityService,
    InsightNotFoundError,
)
from app.utils.taxonomy import all_definitions

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/taxonomy", response_model=list[InsightTypeInfo])
def taxonomy() -> list[InsightTypeInfo]:
    """Return the eight behavioural insight categories and their definitions."""
    return [InsightTypeInfo(**entry) for entry in all_definitions()]


@router.get("/{insight_id}/evidence-quality", response_model=EvidenceQuality)
def evidence_quality(
    insight_id: int, db: Session = Depends(get_db)
) -> EvidenceQuality:
    """Assess how well-supported a single insight is (transparency aid)."""
    service = EvidenceQualityService(db)
    try:
        return service.assess(insight_id)
    except InsightNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
