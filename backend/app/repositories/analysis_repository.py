"""Analysis repository: persists AnalysisRun, CustomerInsight, InsightEvidence."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

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
