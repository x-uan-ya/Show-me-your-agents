"""Behaviour summary router (Trial vs Retention).

Exposes GET /api/clients/{client_id}/behaviour-summary, a customer-understanding
view derived from existing evidence-backed CustomerInsight records. No campaign,
message, or recommendation output.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.behaviour import BehaviourSummary
from app.services.insight_engine.behaviour_summary import (
    BehaviourSummaryService,
    ClientNotFoundError,
)

router = APIRouter(prefix="/clients", tags=["behaviour"])


@router.get("/{client_id}/behaviour-summary", response_model=BehaviourSummary)
def behaviour_summary(
    client_id: int, db: Session = Depends(get_db)
) -> BehaviourSummary:
    service = BehaviourSummaryService(db)
    try:
        return service.summarise(client_id)
    except ClientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
