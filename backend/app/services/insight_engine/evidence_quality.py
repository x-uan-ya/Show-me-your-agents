"""Evidence-quality assessment for a single CustomerInsight.

Reports how well-supported an insight is using transparent, configurable rules.
It never generates marketing recommendations, and it never invents precision or
limitations unrelated to the data: every limitation is derived from an observed
characteristic of the evidence/dataset.

Flags (all thresholds configurable in Settings):
- LIMITED_EVIDENCE: fewer than ``evidence_min_independent`` distinct signals
  support the insight.
- SMALL_SAMPLE: the analysed dataset has fewer than
  ``evidence_min_dataset_sample`` signals in total.
- SOURCE_CONCENTRATION: a single source accounts for more than
  ``evidence_source_concentration_ratio`` of the supporting evidence.
- CONFLICTING_SIGNALS: another insight from the same analysis run in a
  behaviourally opposed category shares one or more of the same supporting
  signals (the same feedback is being read two opposite ways).
- LIMITED_CONTEXT: fewer than ``evidence_min_context_ratio`` of supporting
  signals carry contextual fields (source / date / product).
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.repositories.analysis_repository import AnalysisRepository
from app.schemas.evidence_quality import (
    EvidenceFlag,
    EvidenceQuality,
    EvidenceQualityStatus,
)
from app.utils.confidence import confidence_label

# Behaviourally opposed category pairs. Shared evidence across an opposed pair
# suggests the same feedback supports contradictory interpretations.
_OPPOSED_PAIRS: set[frozenset[str]] = {
    frozenset({"RETENTION_DRIVER", "NON_REPEAT_DRIVER"}),
    frozenset({"PURCHASE_DRIVER", "NON_REPEAT_DRIVER"}),
}

# Static catalogue of possible limitations, each keyed by a data condition. We
# only emit a limitation when its condition is observed in the data, so nothing
# is invented.
_LIM_QUALITATIVE = (
    "Qualitative feedback cannot confirm actual repeat-purchase behaviour."
)
_LIM_ONLINE = (
    "Online feedback may not represent all customers."
)
_LIM_PROMO = (
    "Promotional activity mentioned in the evidence may distort observed behaviour."
)
_LIM_NO_TRANSACTION = (
    "Missing transaction data limits behavioural conclusions."
)
_LIM_SMALL = (
    "Small samples may produce unstable patterns."
)
_LIM_SOURCE = (
    "Evidence is concentrated in a single source, which may bias the picture."
)


class InsightNotFoundError(Exception):
    pass


class EvidenceQualityService:
    def __init__(self, db: Session) -> None:
        self._repo = AnalysisRepository(db)
        self._settings = get_settings()

    def assess(self, insight_id: int) -> EvidenceQuality:
        insight = self._repo.get_insight(insight_id)
        if insight is None:
            raise InsightNotFoundError(f"Insight {insight_id} not found.")

        pairs = self._repo.signals_with_evidence_for_insight(insight_id)
        signals = [signal for _, signal in pairs]
        evidence_count = len(pairs)
        independent_ids = {s.id for s in signals}
        independent_count = len(independent_ids)

        run = self._repo.get_run(insight.analysis_run_id)
        dataset_size = (
            self._repo.dataset_signal_count(run.dataset_id) if run else 0
        )

        source_distribution = self._source_distribution(signals)
        coverage = self._coverage(independent_count, dataset_size)

        flags = self._evaluate_flags(
            insight=insight,
            signals=signals,
            independent_count=independent_count,
            dataset_size=dataset_size,
            source_distribution=source_distribution,
            run_id=insight.analysis_run_id,
        )
        limitations = self._limitations(signals, dataset_size, flags)
        status = self._status(independent_count, flags)
        explanation = self._explanation(status, flags, independent_count, dataset_size)

        return EvidenceQuality(
            insight_id=insight.id,
            status=status,
            confidence=insight.confidence,
            confidence_label=confidence_label(insight.confidence),
            evidence_count=evidence_count,
            independent_evidence_count=independent_count,
            evidence_coverage=coverage,
            source_distribution=source_distribution,
            flags=flags,
            explanation=explanation,
            limitations=limitations,
        )

    # --- metrics -----------------------------------------------------------

    def _source_distribution(self, signals: list[CustomerSignal]) -> dict[str, int]:
        counter: Counter[str] = Counter()
        for s in signals:
            counter[s.source or "unknown"] += 1
        return dict(counter)

    def _coverage(self, independent_count: int, dataset_size: int) -> float | None:
        # Coverage is only meaningful with a known, non-empty dataset.
        if dataset_size <= 0:
            return None
        return round(independent_count / dataset_size, 4)

    # --- flag evaluation ---------------------------------------------------

    def _evaluate_flags(
        self,
        *,
        insight: CustomerInsight,
        signals: list[CustomerSignal],
        independent_count: int,
        dataset_size: int,
        source_distribution: dict[str, int],
        run_id: int,
    ) -> list[EvidenceFlag]:
        flags: list[EvidenceFlag] = []
        cfg = self._settings

        if independent_count < cfg.evidence_min_independent:
            flags.append(EvidenceFlag.LIMITED_EVIDENCE)

        if 0 < dataset_size < cfg.evidence_min_dataset_sample:
            flags.append(EvidenceFlag.SMALL_SAMPLE)

        # Source concentration only meaningful with 2+ evidence items.
        total_ev = sum(source_distribution.values())
        if total_ev >= 2:
            top = max(source_distribution.values())
            if top / total_ev > cfg.evidence_source_concentration_ratio:
                flags.append(EvidenceFlag.SOURCE_CONCENTRATION)

        if self._has_conflicting_signals(insight, run_id):
            flags.append(EvidenceFlag.CONFLICTING_SIGNALS)

        if self._has_limited_context(signals):
            flags.append(EvidenceFlag.LIMITED_CONTEXT)

        return flags

    def _has_conflicting_signals(
        self, insight: CustomerInsight, run_id: int
    ) -> bool:
        own_signal_ids = {e.signal_id for e in insight.evidence}
        if not own_signal_ids:
            return False
        for sibling in self._repo.sibling_insights(run_id, insight.id):
            pair = frozenset({insight.category, sibling.category})
            if pair not in _OPPOSED_PAIRS:
                continue
            sibling_ids = {e.signal_id for e in sibling.evidence}
            if own_signal_ids & sibling_ids:
                return True
        return False

    def _has_limited_context(self, signals: list[CustomerSignal]) -> bool:
        if not signals:
            return True
        with_context = sum(
            1 for s in signals if s.source or s.date or s.product
        )
        ratio = with_context / len(signals)
        return ratio < self._settings.evidence_min_context_ratio

    # --- limitations (data-derived only) -----------------------------------

    def _limitations(
        self,
        signals: list[CustomerSignal],
        dataset_size: int,
        flags: list[EvidenceFlag],
    ) -> list[str]:
        limitations: list[str] = []

        # Always applicable to this system: feedback is qualitative and there is
        # no customer-level transaction data in the model.
        limitations.append(_LIM_QUALITATIVE)
        limitations.append(_LIM_NO_TRANSACTION)

        # Online-origin feedback -> representativeness caveat, only if observed.
        online_markers = {"web_review", "app_review", "online", "web", "app"}
        if any((s.source or "").lower() in online_markers for s in signals):
            limitations.append(_LIM_ONLINE)

        # Promotional signals present in evidence (campaign set or promo wording).
        promo_words = ("voucher", "promo", "promotion", "discount", "offer", "deal")
        if any(
            s.campaign
            or any(w in (s.text or "").lower() for w in promo_words)
            for s in signals
        ):
            limitations.append(_LIM_PROMO)

        if EvidenceFlag.SMALL_SAMPLE in flags:
            limitations.append(_LIM_SMALL)
        if EvidenceFlag.SOURCE_CONCENTRATION in flags:
            limitations.append(_LIM_SOURCE)

        # De-duplicate while preserving order.
        seen: set[str] = set()
        unique: list[str] = []
        for lim in limitations:
            if lim not in seen:
                seen.add(lim)
                unique.append(lim)
        return unique

    # --- status + explanation ---------------------------------------------

    def _status(
        self, independent_count: int, flags: list[EvidenceFlag]
    ) -> EvidenceQualityStatus:
        if independent_count == 0:
            return EvidenceQualityStatus.INSUFFICIENT
        if flags:
            return EvidenceQualityStatus.CAUTION
        return EvidenceQualityStatus.OK

    def _explanation(
        self,
        status: EvidenceQualityStatus,
        flags: list[EvidenceFlag],
        independent_count: int,
        dataset_size: int,
    ) -> str:
        if status is EvidenceQualityStatus.INSUFFICIENT:
            return (
                "This insight has no independent supporting evidence and should "
                "not be relied upon."
            )
        if not flags:
            return (
                f"Supported by {independent_count} independent signal(s) with no "
                "obvious evidence-quality concerns. Treat as an evidence-backed "
                "indication, not proof."
            )
        flag_names = ", ".join(f.value for f in flags)
        return (
            f"Interpret with caution. {independent_count} independent signal(s) "
            f"from a dataset of {dataset_size}. Flags raised: {flag_names}."
        )
