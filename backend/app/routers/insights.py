"""Insight taxonomy router.

Exposes the behavioural taxonomy so the frontend can render the categories the
system reasons about. This is metadata only; no dataset or SME is assumed.
"""

from fastapi import APIRouter

from app.schemas.insight import InsightTypeInfo
from app.utils.taxonomy import all_definitions

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/taxonomy", response_model=list[InsightTypeInfo])
def taxonomy() -> list[InsightTypeInfo]:
    """Return the eight behavioural insight categories and their definitions."""
    return [InsightTypeInfo(**entry) for entry in all_definitions()]
