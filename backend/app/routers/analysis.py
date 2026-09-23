"""Analysis router.

Exposes POST /api/clients/{client_id}/analyse, which runs the Customer Insight
Engine over a client's dataset and returns evidence-backed behavioural insights.
Customer understanding only: no campaign, message, calendar, or schedule output.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
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
    AnalysisInProgressError,
    AnalysisInputLimitError,
    ClientNotFoundError,
    CustomerInsightEngine,
    DatasetNotFoundError,
    DatasetOwnershipError,
    EmptyDatasetError,
    ProviderFailureError,
)
from app.utils.confidence import confidence_label
from app.services.auth.dependencies import require_client_access, require_client_write

router = APIRouter(prefix="/clients", tags=["analysis"])


def _analysis_response(repo: AnalysisRepository, run) -> AnalyseResponse:
    """Serialize a completed run with the exact evidence shape used by analysis."""

    insight_reads: list[InsightRead] = []
    for insight in repo.insights_for_run(run.id):
        evidence = [
            EvidenceRead(
                signal_id=item.signal_id,
                excerpt=item.excerpt,
                relevance_score=item.relevance_score,
            )
            for item in insight.evidence
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
        rejected=[],
    )


@router.get("/{client_id}/analyses/latest", response_model=AnalyseResponse | None)
def latest_completed_analysis(
    client_id: int,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_access),
) -> AnalyseResponse | None:
    """Return the client's latest completed analysis, including persisted evidence."""

    repo = AnalysisRepository(db)
    run = repo.latest_completed_run(client_id)
    return _analysis_response(repo, run) if run else None


@router.post("/{client_id}/analyse", response_model=AnalyseResponse)
def analyse_client_dataset(
    client_id: int,
    payload: AnalyseRequest,
    db: Session = Depends(get_db),
    provider: AIProvider = Depends(get_ai_provider),
    _: Client = Depends(require_client_write),
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
    except AnalysisInputLimitError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except AnalysisInProgressError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except ProviderFailureError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"AI provider failed: {exc}"
        ) from exc

    response = _analysis_response(AnalysisRepository(db), output.run)
    response.rejected = output.rejected
    return response
