"""Customer Insight Engine.

Scope: CUSTOMER UNDERSTANDING ONLY. This engine analyses CustomerSignal records
and identifies evidence-backed behavioural insights. It never generates campaign
strategy, marketing messages, ideas, calendars, or schedules.

Workflow for POST /api/clients/{client_id}/analyse:
  1. verify client
  2. verify dataset belongs to client
  3. retrieve CustomerSignal records
  4. prepare a safe structured representation
  5. send signals through the configured AIProvider
  6. validate the structured response
  7. verify evidence ids reference supplied signals
  8. calculate evidence count (deduped)
  9. store CustomerInsight records
 10. store InsightEvidence relationships
 11. store AnalysisRun
 12. return structured insights

Grounding rule: an insight without valid, supplied-signal evidence is never
stored as a customer insight.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models.analysis_run import AnalysisRun
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.client_repository import ClientRepository
from app.repositories.dataset_repository import DatasetRepository
from app.services.ai.base import AIProvider, SignalInput
from app.services.ai.prompt import build_analysis_prompt
from app.services.ai.validation import validate_ai_output


class AnalysisError(Exception):
    """Base error for analysis problems the router maps to HTTP responses."""


class ClientNotFoundError(AnalysisError):
    pass


class DatasetNotFoundError(AnalysisError):
    pass


class DatasetOwnershipError(AnalysisError):
    """Dataset exists but belongs to a different client."""


class EmptyDatasetError(AnalysisError):
    """The dataset has no customer signals to analyse."""


class ProviderFailureError(AnalysisError):
    """The AI provider raised while analysing."""


@dataclass
class AnalysisOutput:
    run: AnalysisRun
    insights: list[CustomerInsight]
    rejected: list[str]


class CustomerInsightEngine:
    def __init__(self, db: Session, provider: AIProvider) -> None:
        self._db = db
        self._provider = provider
        self._clients = ClientRepository(db)
        self._datasets = DatasetRepository(db)
        self._analysis = AnalysisRepository(db)

    def analyse(self, client_id: int, dataset_id: int) -> AnalysisOutput:
        # 1. verify client
        client = self._clients.get(client_id)
        if client is None:
            raise ClientNotFoundError(f"Client {client_id} not found.")

        # 2. verify dataset belongs to client
        dataset = self._datasets.get(dataset_id)
        if dataset is None:
            raise DatasetNotFoundError(f"Dataset {dataset_id} not found.")
        if dataset.client_id != client_id:
            raise DatasetOwnershipError(
                f"Dataset {dataset_id} does not belong to client {client_id}."
            )

        # 3. retrieve CustomerSignal records
        signals = self._analysis.signals_for_dataset(dataset_id)
        if not signals:
            raise EmptyDatasetError(f"Dataset {dataset_id} has no customer signals.")

        # Client-isolation guarantee: every gathered signal must belong to the
        # verified client. signals_for_dataset already scopes by the owned
        # dataset; this assertion is defence in depth against a future query
        # change silently leaking cross-client data into a model request.
        assert all(
            s.client_id == client_id for s in signals
        ), "Refusing to analyse signals from another client."

        # 4. prepare a safe structured representation (id as string; text only,
        #    plus minimal non-sensitive context). Customer text stays untrusted
        #    data; we never treat it as instructions.
        signal_inputs = [self._to_signal_input(s) for s in signals]
        signal_by_id = {str(s.id): s for s in signals}
        supplied_ids = list(signal_by_id.keys())

        # Build the framed prompt (SYSTEM INSTRUCTIONS vs untrusted CUSTOMER DATA)
        # from this single client's signals. The mock provider classifies from
        # SignalInput directly; the hackathon provider will send this prompt to
        # the model. Constructing it here guarantees the separation is applied
        # to exactly the signals we validated as owned by this client.
        self._prompt = build_analysis_prompt(signal_inputs)

        # 11 (open the run first so provider failures are recorded).
        run = self._analysis.create_run(
            client_id=client_id,
            dataset_id=dataset_id,
            model_provider=self._provider.name,
            model_name=None,
        )

        # 5. send signals through the configured AIProvider
        try:
            provider_result = self._provider.analyze_signals(signal_inputs)
        except Exception as exc:  # provider failure must not crash the request
            self._analysis.mark_run_failed(run, f"Provider error: {exc}")
            raise ProviderFailureError(str(exc)) from exc

        # 6 & 7. validate the structured response and verify evidence ids. We
        # re-run validation here (defence in depth) so even a provider that
        # skipped its own validation cannot bypass the contract or grounding.
        outcome = validate_ai_output(
            provider_result.model_dump(), supplied_ids
        )

        stored: list[CustomerInsight] = []
        for ai_insight in outcome.result.insights:
            # 8. calculate evidence count with duplicates removed, preserving
            #    order. Grounding is already guaranteed by validation, but we
            #    defensively skip any insight that ends up with no evidence.
            seen: set[str] = set()
            evidence_pairs: list[tuple[int, str]] = []
            for sid in ai_insight.evidence_signal_ids:
                if sid in seen:
                    continue
                seen.add(sid)
                signal = signal_by_id.get(sid)
                if signal is None:
                    continue  # should not happen post-validation
                evidence_pairs.append((signal.id, signal.text))

            if not evidence_pairs:
                outcome.rejected.append(
                    f"Insight '{ai_insight.title}' dropped: no valid evidence after dedup."
                )
                continue

            # 9 & 10. store the insight and its evidence relationships.
            insight = self._analysis.store_insight(
                client_id=client_id,
                run_id=run.id,
                title=ai_insight.title,
                summary=ai_insight.summary,
                category=ai_insight.category.value,
                confidence=ai_insight.confidence,
                reasoning_summary=ai_insight.reasoning_summary,
                evidence=evidence_pairs,
            )
            stored.append(insight)

        self._analysis.mark_run_completed(run)

        # 12. return structured insights
        return AnalysisOutput(run=run, insights=stored, rejected=outcome.rejected)

    def _to_signal_input(self, signal: CustomerSignal) -> SignalInput:
        context = {
            "product": signal.product,
            "rating": signal.rating,
            "source": signal.source,
        }
        # Drop empty context keys to keep the representation tidy.
        context = {k: v for k, v in context.items() if v is not None}
        return SignalInput(id=str(signal.id), text=signal.text, context=context)
