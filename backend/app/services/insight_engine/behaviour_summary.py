"""Trial vs Retention behaviour summary.

Builds a customer-understanding view from EXISTING, evidence-backed
CustomerInsight records. It groups insights into trial, retention, and
non-repeat drivers, and adds neutral observations plus honest limitations.

Principles:
- Use only stored, validated insights that actually have supporting evidence
  (grounding rule). An insight without evidence is not included.
- Never claim causation or invent statistics. We do not compute repeat-purchase
  rates or percentages: the dataset holds qualitative feedback, not
  customer-level transaction history, so such figures would be unsupported.
- The taxonomy hints (curiosity, voucher, quality, trust, poor support, ...) are
  NOT hardcoded conclusions. Drivers come from whatever the stored insights and
  their evidence actually say.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.customer_insight import CustomerInsight
from app.repositories.client_repository import ClientRepository
from app.schemas.behaviour import (
    BehaviourDriver,
    BehaviourEvidence,
    BehaviourSummary,
)
from app.utils.categories import InsightCategory
from app.utils.confidence import confidence_label

_TRIAL = InsightCategory.TRIAL_DRIVER.value
_RETENTION = InsightCategory.RETENTION_DRIVER.value
_NON_REPEAT = InsightCategory.NON_REPEAT_DRIVER.value

# Static, honest caveats about what qualitative feedback can/cannot establish.
_BASE_LIMITATIONS = [
    "Available customer signals suggest behavioural patterns but do not by "
    "themselves establish causation.",
    "Feedback reflects only customers who chose to leave it, so it may not "
    "represent all customers.",
    "This summary describes what customers say, not verified purchase or "
    "return behaviour.",
]

# Caveat added whenever we lack customer-level transaction data (always true for
# a qualitative-feedback dataset). This is why no percentages are produced.
_NO_TRANSACTION_LIMITATION = (
    "The dataset contains qualitative feedback, not customer-level transaction "
    "records, so repeat-purchase rates and percentages cannot be calculated and "
    "are not reported."
)


class ClientNotFoundError(Exception):
    pass


class BehaviourSummaryService:
    def __init__(self, db: Session) -> None:
        self._clients = ClientRepository(db)

    def summarise(self, client_id: int) -> BehaviourSummary:
        if self._clients.get(client_id) is None:
            raise ClientNotFoundError(f"Client {client_id} not found.")

        insights = self._clients.insights_by_categories(
            client_id, [_TRIAL, _RETENTION, _NON_REPEAT]
        )

        trial = [self._to_driver(i) for i in insights if i.category == _TRIAL]
        retention = [self._to_driver(i) for i in insights if i.category == _RETENTION]
        non_repeat = [self._to_driver(i) for i in insights if i.category == _NON_REPEAT]

        # Grounding rule: drop any driver that ended up without evidence.
        trial = [d for d in trial if d is not None]
        retention = [d for d in retention if d is not None]
        non_repeat = [d for d in non_repeat if d is not None]

        observations = self._observations(trial, retention, non_repeat)
        limitations = list(_BASE_LIMITATIONS) + [_NO_TRANSACTION_LIMITATION]

        return BehaviourSummary(
            trial_drivers=trial,
            retention_drivers=retention,
            non_repeat_drivers=non_repeat,
            observations=observations,
            limitations=limitations,
        )

    def _to_driver(self, insight: CustomerInsight) -> BehaviourDriver | None:
        # Enforce grounding: skip insights that have no stored evidence.
        if not insight.evidence:
            return None
        evidence = [
            BehaviourEvidence(signal_id=e.signal_id, excerpt=e.excerpt)
            for e in insight.evidence
        ]
        return BehaviourDriver(
            insight_id=insight.id,
            title=insight.title,
            summary=insight.summary,
            confidence=insight.confidence,
            confidence_label=confidence_label(insight.confidence),
            evidence_count=len(evidence),
            evidence=evidence,
        )

    def _observations(
        self,
        trial: list[BehaviourDriver],
        retention: list[BehaviourDriver],
        non_repeat: list[BehaviourDriver],
    ) -> list[str]:
        """Neutral, non-causal notes. Uses hedged language only."""
        notes: list[str] = []

        if not trial and not retention and not non_repeat:
            notes.append(
                "No evidence-backed trial, retention, or non-repeat drivers were "
                "found for this client yet. Run an analysis on a dataset first."
            )
            return notes

        notes.append(
            f"Available evidence indicates {len(trial)} trial driver(s), "
            f"{len(retention)} retention driver(s), and {len(non_repeat)} "
            "non-repeat driver(s)."
        )

        if trial and not retention:
            notes.append(
                "Customer feedback points to reasons for trying the offering, but "
                "little evidence yet on why customers continue. Trial interest does "
                "not by itself indicate ongoing demand."
            )
        if retention and not trial:
            notes.append(
                "Evidence describes reasons customers continue, with limited "
                "evidence on what first prompted them to try."
            )
        if non_repeat:
            notes.append(
                "Some feedback appears associated with customers not continuing; "
                "this is worth examining alongside retention drivers."
            )

        return notes
