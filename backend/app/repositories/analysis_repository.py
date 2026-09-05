"""Analysis repository: persists AnalysisRun, CustomerInsight, InsightEvidence."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.analysis_run import AnalysisRun
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.models.insight_evidence import InsightEvidence


class AnalysisRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def signals_for_dataset(self, dataset_id: int) -> list[CustomerSignal]:
        stmt = (
            select(CustomerSignal)
            .where(CustomerSignal.dataset_id == dataset_id)
            .order_by(CustomerSignal.id)
        )
        return list(self._db.scalars(stmt).all())

    def create_run(
        self,
        *,
        client_id: int,
        dataset_id: int,
        model_provider: str,
        model_name: str | None,
        status: str = "running",
    ) -> AnalysisRun:
        run = AnalysisRun(
            client_id=client_id,
            dataset_id=dataset_id,
            model_provider=model_provider,
            model_name=model_name,
            status=status,
        )
        self._db.add(run)
        self._db.commit()
        self._db.refresh(run)
        return run

    def mark_run_completed(self, run: AnalysisRun) -> None:
        run.status = "completed"
        run.completed_at = datetime.now(timezone.utc)
        self._db.commit()
        self._db.refresh(run)

    def mark_run_failed(self, run: AnalysisRun, error_message: str) -> None:
        run.status = "failed"
        run.error_message = error_message
        run.completed_at = datetime.now(timezone.utc)
        self._db.commit()
        self._db.refresh(run)

    def store_insight(
        self,
        *,
        client_id: int,
        run_id: int,
        title: str,
        summary: str,
        category: str,
        confidence: float,
        reasoning_summary: str,
        evidence: list[tuple[int, str]],
    ) -> CustomerInsight:
        """Persist one insight and its evidence rows.

        ``evidence`` is a list of (signal_id, excerpt) tuples already deduped by
        the caller. ``evidence_count`` reflects the number of stored evidence
        rows. An insight with no evidence must never reach this method.
        """
        if not evidence:
            raise ValueError("Refusing to store an insight without evidence.")

        insight = CustomerInsight(
            client_id=client_id,
            analysis_run_id=run_id,
            title=title,
            summary=summary,
            category=category,
            confidence=confidence,
            evidence_count=len(evidence),
            reasoning_summary=reasoning_summary or None,
        )
        self._db.add(insight)
        self._db.flush()  # assign insight.id before creating evidence rows

        for signal_id, excerpt in evidence:
            self._db.add(
                InsightEvidence(
                    insight_id=insight.id,
                    signal_id=signal_id,
                    excerpt=excerpt,
                )
            )

        self._db.commit()
        self._db.refresh(insight)
        return insight

    def evidence_for_insight(self, insight_id: int) -> list[InsightEvidence]:
        stmt = (
            select(InsightEvidence)
            .where(InsightEvidence.insight_id == insight_id)
            .order_by(InsightEvidence.id)
        )
        return list(self._db.scalars(stmt).all())

    def get_insight(self, insight_id: int) -> CustomerInsight | None:
        return self._db.get(CustomerInsight, insight_id)

    def get_insight_for_client(
        self, insight_id: int, client_id: int
    ) -> CustomerInsight | None:
        """Fetch an insight only if it belongs to ``client_id``.

        Enforces client isolation: an insight owned by another client is treated
        as if it does not exist for this caller.
        """
        insight = self._db.get(CustomerInsight, insight_id)
        if insight is None or insight.client_id != client_id:
            return None
        return insight

    def get_run(self, run_id: int) -> AnalysisRun | None:
        return self._db.get(AnalysisRun, run_id)

    def signals_with_evidence_for_insight(
        self, insight_id: int
    ) -> list[tuple[InsightEvidence, CustomerSignal]]:
        """Return (evidence, signal) pairs backing an insight."""
        stmt = (
            select(InsightEvidence, CustomerSignal)
            .join(CustomerSignal, InsightEvidence.signal_id == CustomerSignal.id)
            .where(InsightEvidence.insight_id == insight_id)
            .order_by(InsightEvidence.id)
        )
        return [tuple(row) for row in self._db.execute(stmt).all()]

    def dataset_signal_count(self, dataset_id: int) -> int:
        stmt = select(func.count(CustomerSignal.id)).where(
            CustomerSignal.dataset_id == dataset_id
        )
        return int(self._db.scalar(stmt) or 0)

    def sibling_insights(
        self, run_id: int, exclude_insight_id: int
    ) -> list[CustomerInsight]:
        """Other insights produced by the same analysis run, evidence loaded."""
        stmt = (
            select(CustomerInsight)
            .where(
                CustomerInsight.analysis_run_id == run_id,
                CustomerInsight.id != exclude_insight_id,
            )
            .options(selectinload(CustomerInsight.evidence))
        )
        return list(self._db.scalars(stmt).all())
