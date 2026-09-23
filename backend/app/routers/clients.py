"""Client router.

Exposes client management and read access to a client's datasets, signals and
insights. Every sub-resource is scoped by ``client_id`` so cross-client access
is not possible. Routes return Pydantic schemas, never ORM objects.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.repositories.analysis_repository import AnalysisRepository
from app.repositories.campaign_repository import CampaignRepository
from app.repositories.client_repository import ClientRepository
from app.repositories.user_repository import UserRepository
from app.schemas.client import ClientCreate, ClientRead, WorkflowStatusRead
from app.schemas.customer_insight import CustomerInsightRead
from app.schemas.customer_signal import CustomerSignalRead
from app.schemas.dataset import DatasetRead
from app.schemas.evidence_quality import EvidenceQuality
from app.services.insight_engine.evidence_quality import (
    EvidenceQualityService,
    InsightNotFoundError,
)
from app.services.auth.dependencies import (
    AccessContext,
    get_current_access,
    require_client_access,
    require_client_admin,
)

router = APIRouter(prefix="/clients", tags=["clients"])


def _repo(db: Session = Depends(get_db)) -> ClientRepository:
    return ClientRepository(db)


def _require_client(repo: ClientRepository, client_id: int):
    client = repo.get(client_id)
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )
    return client


@router.post("", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
def create_client(
    payload: ClientCreate,
    repo: ClientRepository = Depends(_repo),
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> ClientRead:
    if access.workspace_role not in {"admin", "strategist"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Client creation is not permitted")
    client = repo.create(payload, access.workspace_id)
    if access.workspace_role != "admin":
        UserRepository(db).add_membership(access.user.id, client.id, "strategist")
    return ClientRead.model_validate(client)


@router.get("", response_model=list[ClientRead])
def list_clients(
    repo: ClientRepository = Depends(_repo),
    access: AccessContext = Depends(get_current_access),
) -> list[ClientRead]:
    return [
        ClientRead.model_validate(client)
        for client in repo.list_for_access(
            workspace_id=access.workspace_id,
            user_id=access.user.id,
            workspace_role=access.workspace_role,
        )
    ]


@router.get("/{client_id}", response_model=ClientRead)
def get_client(
    client_id: int,
    client: Client = Depends(require_client_access),
) -> ClientRead:
    return ClientRead.model_validate(client)


@router.get("/{client_id}/workflow-status", response_model=WorkflowStatusRead)
def get_client_workflow_status(
    client_id: int,
    db: Session = Depends(get_db),
    client: Client = Depends(require_client_access),
) -> WorkflowStatusRead:
    """Calculate workflow completion exclusively from persisted client records."""

    clients = ClientRepository(db)
    campaigns = CampaignRepository(db)
    analysis = AnalysisRepository(db)

    brief_record = campaigns.get_brief(client_id)
    brief_complete = bool(
        brief_record
        and brief_record.objective.strip()
        and brief_record.target_audience.strip()
        and brief_record.channels
    )
    ready_datasets = [
        item for item in clients.list_datasets(client_id)
        if item.status.lower() == "ready"
    ]
    latest_run = analysis.latest_completed_run(client_id)
    latest_insights = analysis.insights_for_run(latest_run.id) if latest_run else []
    saved_campaigns = campaigns.list_campaigns(client_id)
    latest_campaign = saved_campaigns[0] if saved_campaigns else None
    approval_complete = bool(
        latest_campaign
        and latest_campaign.approval
        and latest_campaign.approval.status == "approved"
    )
    scheduled_items = [
        item
        for campaign in saved_campaigns
        for item in campaign.content_items
        if item.publish_date is not None
    ]

    if not brief_complete:
        next_step = "brief"
    elif not ready_datasets:
        next_step = "data"
    elif latest_run is None or not latest_insights:
        next_step = "analysis"
    elif latest_campaign is None:
        next_step = "campaign"
    elif not approval_complete:
        next_step = "approval"
    elif not scheduled_items:
        next_step = "schedule"
    else:
        next_step = "complete"

    latest_dataset_id = (
        latest_run.dataset_id
        if latest_run
        else (max(item.id for item in ready_datasets) if ready_datasets else None)
    )
    return WorkflowStatusRead(
        client_id=client_id,
        client_name=client.name,
        brief=brief_complete,
        data=bool(ready_datasets),
        analysis=latest_run is not None,
        insights=bool(latest_insights),
        campaign=latest_campaign is not None,
        approval=approval_complete,
        schedule=bool(scheduled_items),
        latest_dataset_id=latest_dataset_id,
        latest_analysis_run_id=latest_run.id if latest_run else None,
        latest_campaign_id=latest_campaign.id if latest_campaign else None,
        insight_count=len(latest_insights),
        scheduled_item_count=len(scheduled_items),
        recommended_next_step=next_step,
    )


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_client(
    client_id: int,
    repo: ClientRepository = Depends(_repo),
    _: Client = Depends(require_client_admin),
) -> None:
    """Delete a client and the client-owned datasets, insights and campaigns."""
    if not repo.delete(client_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )


@router.get("/{client_id}/datasets", response_model=list[DatasetRead])
def list_client_datasets(
    client_id: int,
    repo: ClientRepository = Depends(_repo),
    _: Client = Depends(require_client_access),
) -> list[DatasetRead]:
    return [DatasetRead.model_validate(d) for d in repo.list_datasets(client_id)]


@router.get("/{client_id}/signals", response_model=list[CustomerSignalRead])
def list_client_signals(
    client_id: int,
    repo: ClientRepository = Depends(_repo),
    _: Client = Depends(require_client_access),
) -> list[CustomerSignalRead]:
    return [CustomerSignalRead.model_validate(s) for s in repo.list_signals(client_id)]


@router.get("/{client_id}/insights", response_model=list[CustomerInsightRead])
def list_client_insights(
    client_id: int,
    repo: ClientRepository = Depends(_repo),
    _: Client = Depends(require_client_access),
) -> list[CustomerInsightRead]:
    return [CustomerInsightRead.model_validate(i) for i in repo.list_insights(client_id)]


@router.get(
    "/{client_id}/insights/{insight_id}/evidence-quality",
    response_model=EvidenceQuality,
)
def insight_evidence_quality(
    client_id: int,
    insight_id: int,
    db: Session = Depends(get_db),
    repo: ClientRepository = Depends(_repo),
    _: Client = Depends(require_client_access),
) -> EvidenceQuality:
    """Assess how well-supported an insight is, scoped to the owning client."""
    service = EvidenceQualityService(db)
    try:
        # Ownership enforced inside the service via get_insight_for_client.
        return service.assess(insight_id, client_id)
    except InsightNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
