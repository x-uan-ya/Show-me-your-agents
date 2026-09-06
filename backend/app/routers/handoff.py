"""Downstream handoff router.

Exposes validated Customer Insight Intelligence results for other team
components to integrate against, without needing to understand the internal
insight engine.

- GET /api/clients/{client_id}/insight-context
- GET /api/clients/{client_id}/insights/export?format=json|csv

The payload contains customer understanding only: no campaign objectives,
marketing recommendations, ideas, content, calendars, or publishing schedules.
"""

from __future__ import annotations

import csv
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.insight_context import ContextInsight, InsightContext
from app.services.insight_engine.insight_context import (
    ContextClientNotFoundError,
    InsightContextService,
)

router = APIRouter(prefix="/clients", tags=["handoff"])

# Order in which category groups are flattened for CSV / iteration.
_GROUP_FIELDS = [
    "purchase_drivers",
    "trial_drivers",
    "retention_drivers",
    "non_repeat_drivers",
    "pain_points",
    "unmet_needs",
    "customer_anxieties",
    "emerging_demand",
]


def _build_context(client_id: int, db: Session) -> InsightContext:
    service = InsightContextService(db)
    try:
        return service.build(client_id)
    except ContextClientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


@router.get("/{client_id}/insight-context", response_model=InsightContext)
def insight_context(
    client_id: int, db: Session = Depends(get_db)
) -> InsightContext:
    """Structured, validated customer-insight context for downstream use."""
    return _build_context(client_id, db)


def _iter_insights(context: InsightContext):
    for field in _GROUP_FIELDS:
        for insight in getattr(context, field):
            yield insight


def _context_to_csv(context: InsightContext) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "client_id",
            "analysis_run_id",
            "dataset_id",
            "insight_id",
            "category",
            "title",
            "summary",
            "confidence",
            "confidence_label",
            "evidence_count",
            "evidence_quality_status",
            "evidence_quality_flags",
            "supporting_evidence_ids",
        ]
    )
    for insight in _iter_insights(context):
        insight: ContextInsight
        writer.writerow(
            [
                context.client_id,
                context.analysis_run_id or "",
                context.dataset_id or "",
                insight.insight_id,
                insight.category.value,
                insight.title,
                insight.summary,
                insight.confidence,
                insight.confidence_label,
                insight.evidence_count,
                insight.evidence_quality.status,
                ";".join(insight.evidence_quality.flags),
                ";".join(str(i) for i in insight.supporting_evidence_ids),
            ]
        )
    return output.getvalue()


@router.get("/{client_id}/insights/export")
def export_insights(
    client_id: int,
    format: str = Query("json", pattern="^(json|csv)$"),
    db: Session = Depends(get_db),
):
    """Export the client's insight context as JSON (default) or CSV."""
    context = _build_context(client_id, db)

    if format == "csv":
        body = _context_to_csv(context)
        return StreamingResponse(
            iter([body]),
            media_type="text/csv",
            headers={
                "Content-Disposition": (
                    f"attachment; filename=client_{client_id}_insights.csv"
                )
            },
        )

    # JSON: reuse the same validated context payload.
    return context
