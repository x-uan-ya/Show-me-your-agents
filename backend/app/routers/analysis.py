"""Analysis router.

Exposes POST /api/clients/{client_id}/analyse, which runs the Customer Insight
Engine over a client's dataset and returns evidence-backed behavioural insights.
Customer understanding only: no campaign, message, calendar, or schedule output.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.repositories.analysis_repository import AnalysisRepository
from app.services.ai.base import AIProvider
from app.schemas.analysis import (
    AnalyseRequest,
    AnalyseResponse,
    AnalysisRunRead,
    EvidenceRead,
    InsightRead,
)
from app.services.ai.factory import get_ai_provider
from app.services.insight_engine.customer_engine import (
    ClientNotFoundError,
    CustomerInsightEngine,
    DatasetNotFoundError,
    DatasetOwnershipError,
    EmptyDatasetError,
    ProviderFailureError,
)
from app.utils.confidence import confidence_label

router = APIRouter(prefix="/clients", tags=["analysis"])


@router.post("/{client_id}/analyse", response_model=AnalyseResponse)
def analyse_client_dataset(
    client_id: int,
    payload: AnalyseRequest,
    db: Session = Depends(get_db),
    provider: AIProvider = Depends(get_ai_provider),
) -> AnalyseResponse:
    engine = CustomerInsightEngine(db, provider)

    try:
        output = engine.analyse(client_id, payload.dataset_id)
    except ClientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except DatasetNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except DatasetOwnershipError as exc:
        # Dataset exists but not for this client: forbid rather than 404 so the
        # distinction is clear, without leaking other clients' data.
        raise HTTPException(status.HTTP_403_FORBIDDEN, str(exc)) from exc
    except EmptyDatasetError as exc:
        # 422: request is well-formed but the dataset has nothing to analyse.
        raise HTTPException(422, str(exc)) from exc
    except ProviderFailureError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"AI provider failed: {exc}"
        ) from exc

    repo = AnalysisRepository(db)
    insight_reads: list[InsightRead] = []
    for insight in output.insights:
        evidence = [
            EvidenceRead(
                signal_id=e.signal_id,
                excerpt=e.excerpt,
                relevance_score=e.relevance_score,
            )
            for e in repo.evidence_for_insight(insight.id)
        ]
        insight_reads.append(
            InsightRead(
                id=insight.id,
                client_id=insight.client_id,
                analysis_run_id=insight.analysis_run_id,
                title=insight.title,
                summary=insight.summary,
                category=insight.category,
                confidence=insight.confidence,
                confidence_label=confidence_label(insight.confidence),
                evidence_count=insight.evidence_count,
                reasoning_summary=insight.reasoning_summary,
                evidence=evidence,
            )
        )

    run = output.run
    return AnalyseResponse(
        analysis_run=AnalysisRunRead(
            id=run.id,
            client_id=run.client_id,
            dataset_id=run.dataset_id,
            status=run.status,
            model_provider=run.model_provider,
            model_name=run.model_name,
            started_at=run.started_at,
            completed_at=run.completed_at,
            error_message=run.error_message,
        ),
        insights=insight_reads,
        rejected=output.rejected,
    )
