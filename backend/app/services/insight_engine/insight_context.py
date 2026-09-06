"""Insight-context assembly service (downstream handoff).

Assembles a single coherent snapshot of validated customer insights for a
client, grouped by behavioural category, with per-insight evidence-quality and a
dataset-level data-quality summary. Uses the latest COMPLETED analysis run.

This is customer-understanding output only. It contains no campaign, message,
or scheduling concepts.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.customer_insight import CustomerInsight
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.client_repository import ClientRepository
from app.schemas.insight_context import (
    ContextInsight,
    DataQuality,
    InsightContext,
    InsightEvidenceQuality,
)
from app.services.insight_engine.evidence_quality import EvidenceQualityService
from app.utils.categories import InsightCategory
from app.utils.confidence import confidence_label

# Maps each category to the response field that holds it.
_CATEGORY_TO_FIELD: dict[str, str] = {
    InsightCategory.PURCHASE_DRIVER.value: "purchase_drivers",
    InsightCategory.TRIAL_DRIVER.value: "trial_drivers",
    InsightCategory.RETENTION_DRIVER.value: "retention_drivers",
    InsightCategory.NON_REPEAT_DRIVER.value: "non_repeat_drivers",
    InsightCategory.PAIN_POINT.value: "pain_points",
    InsightCategory.UNMET_NEED.value: "unmet_needs",
    InsightCategory.CUSTOMER_ANXIETY.value: "customer_anxieties",
    InsightCategory.EMERGING_DEMAND.value: "emerging_demand",
}


class ContextClientNotFoundError(Exception):
    pass


class InsightContextService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._clients = ClientRepository(db)
        self._analysis = AnalysisRepository(db)
        self._quality = EvidenceQualityService(db)
        self._settings = get_settings()

    def build(self, client_id: int) -> InsightContext:
        if self._clients.get(client_id) is None:
            raise ContextClientNotFoundError(f"Client {client_id} not found.")

        run = self._analysis.latest_completed_run(client_id)
        if run is None:
            # Valid but empty context: the client has no completed analysis yet.
            return InsightContext(
                client_id=client_id,
                limitations=[
                    "No completed analysis run exists for this client yet.",
                ],
            )

        insights = self._analysis.insights_for_run(run.id)

        grouped: dict[str, list[ContextInsight]] = {
            field: [] for field in _CATEGORY_TO_FIELD.values()
        }
        all_limitations: list[str] = []
        caution_count = 0

        for insight in insights:
            context_insight, quality = self._to_context_insight(insight, client_id)
            field = _CATEGORY_TO_FIELD.get(insight.category)
            if field is None:
                continue  # unknown category: skip rather than mis-group
            grouped[field].append(context_insight)
            if quality.status != "OK":
                caution_count += 1
            all_limitations.extend(quality.limitations)

        dataset_size = self._analysis.dataset_signal_count(run.dataset_id)
        data_quality = DataQuality(
            dataset_signal_count=dataset_size,
            total_insights=len(insights),
            insights_with_caution=caution_count,
            small_sample=0 < dataset_size < self._settings.evidence_min_dataset_sample,
        )

        # Deduplicate limitations, preserving first-seen order.
        seen: set[str] = set()
        limitations: list[str] = []
        for lim in all_limitations:
            if lim not in seen:
                seen.add(lim)
                limitations.append(lim)

        return InsightContext(
            client_id=client_id,
            analysis_run_id=run.id,
            dataset_id=run.dataset_id,
            generated_at=run.completed_at,
            data_quality=data_quality,
            limitations=limitations,
            **grouped,
        )

    def _to_context_insight(
        self, insight: CustomerInsight, client_id: int
    ):
        # Reuse the real evidence-quality assessment (single source of truth).
        quality = self._quality.assess(insight.id, client_id)
        context_insight = ContextInsight(
            insight_id=insight.id,
            category=insight.category,
            title=insight.title,
            summary=insight.summary,
            confidence=insight.confidence,
            confidence_label=confidence_label(insight.confidence),
            evidence_count=insight.evidence_count,
            evidence_quality=InsightEvidenceQuality(
                status=quality.status.value,
                flags=[f.value for f in quality.flags],
            ),
            supporting_evidence_ids=[e.signal_id for e in insight.evidence],
        )
        return context_insight, quality
