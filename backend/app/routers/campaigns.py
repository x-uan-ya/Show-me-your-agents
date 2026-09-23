"""Persistence endpoints for briefs, campaigns and campaign calendar items."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.repositories.campaign_repository import CampaignReferenceError, CampaignRepository
from app.schemas.campaign import (
    CampaignCalendarItemRead,
    CampaignContentStatusUpdate,
    CampaignCreate,
    CampaignGenerateRequest,
    CampaignGenerationRead,
    CampaignRead,
    CampaignStatusUpdate,
    ContentStatus,
    MarketingBriefRead,
    MarketingBriefWrite,
)
from app.services.ai.base import AIProvider
from app.services.ai.factory import get_ai_provider
from app.services.campaign_generation.service import (
    CampaignGenerationError,
    CampaignGenerationService,
)
from app.services.auth.dependencies import (
    AccessContext,
    accessible_client_ids,
    get_current_access,
    require_client_access,
    require_client_review,
    require_client_write,
    user_can_access_client,
)
from app.services.rate_limit import enforce_ai_action

router = APIRouter(prefix="/clients/{client_id}", tags=["campaigns"])
calendar_router = APIRouter(prefix="/calendar", tags=["campaigns"])


def _require_client(db: Session, client_id: int) -> None:
    if db.get(Client, client_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )


@calendar_router.get("", response_model=list[CampaignCalendarItemRead])
def list_calendar_items(
    client_id: int | None = Query(default=None, ge=1),
    start_date: date | None = None,
    end_date: date | None = None,
    channel: str | None = Query(default=None, min_length=1, max_length=128),
    item_status: ContentStatus | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> list[CampaignCalendarItemRead]:
    """Return persisted, dated content items with campaign and client context."""

    if start_date and end_date and end_date < start_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="end_date must be on or after start_date",
        )
    if client_id is not None:
        if not user_can_access_client(db, access, client_id):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")

    items = CampaignRepository(db).list_calendar_items(
        client_id=client_id,
        client_ids=accessible_client_ids(db, access) if client_id is None else None,
        start_date=start_date,
        end_date=end_date,
        channel=channel,
        item_status=item_status,
    )
    return [
        CampaignCalendarItemRead(
            id=item.id,
            campaign_id=item.campaign_id,
            campaign_name=item.campaign.name,
            campaign_status=item.campaign.status,
            client_id=item.campaign.client_id,
            client_name=item.campaign.client.name,
            channel=item.channel,
            publish_date=item.publish_date,
            status=item.status,
            content=item.content,
            content_type=item.content_type,
            cta=item.cta,
            owner=item.owner,
        )
        for item in items
        if item.publish_date is not None
    ]


@calendar_router.patch("/{item_id}/status", response_model=CampaignCalendarItemRead)
def update_calendar_item_status(
    item_id: int,
    payload: CampaignContentStatusUpdate,
    client_id: int | None = Query(default=None, ge=1),
    db: Session = Depends(get_db),
    access: AccessContext = Depends(get_current_access),
) -> CampaignCalendarItemRead:
    """Simulate scheduling or publishing without calling an external platform."""
    if client_id is not None:
        if not user_can_access_client(db, access, client_id, "write"):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
    item = CampaignRepository(db).get_calendar_item(item_id, client_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar item not found")
    if not user_can_access_client(db, access, item.campaign.client_id, "write"):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Calendar item not found")
    item = CampaignRepository(db).update_calendar_item_status(item, payload)
    return CampaignCalendarItemRead(
        id=item.id,
        campaign_id=item.campaign_id,
        campaign_name=item.campaign.name,
        campaign_status=item.campaign.status,
        client_id=item.campaign.client_id,
        client_name=item.campaign.client.name,
        channel=item.channel,
        publish_date=item.publish_date,
        status=item.status,
        content=item.content,
        content_type=item.content_type,
        cta=item.cta,
        owner=item.owner,
    )


@router.put("/marketing-brief", response_model=MarketingBriefRead)
def save_marketing_brief(
    client_id: int,
    payload: MarketingBriefWrite,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_write),
) -> MarketingBriefRead:
    brief = CampaignRepository(db).upsert_brief(client_id, payload)
    return MarketingBriefRead.model_validate(brief)


@router.get("/marketing-brief", response_model=MarketingBriefRead | None)
def get_marketing_brief(
    client_id: int,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_access),
) -> MarketingBriefRead | None:
    brief = CampaignRepository(db).get_brief(client_id)
    return MarketingBriefRead.model_validate(brief) if brief else None


@router.post(
    "/campaigns",
    response_model=CampaignRead,
    status_code=status.HTTP_201_CREATED,
)
def create_campaign(
    client_id: int,
    payload: CampaignCreate,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_write),
) -> CampaignRead:
    try:
        campaign = CampaignRepository(db).create_campaign(client_id, payload)
    except CampaignReferenceError as exc:
        raise HTTPException(422, str(exc)) from exc
    return CampaignRead.model_validate(campaign)


@router.post(
    "/campaigns/generate",
    response_model=CampaignGenerationRead,
    status_code=status.HTTP_201_CREATED,
)
def generate_campaign(
    client_id: int,
    payload: CampaignGenerateRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: AIProvider = Depends(get_ai_provider),
    access: AccessContext = Depends(get_current_access),
    _: Client = Depends(require_client_write),
) -> CampaignGenerationRead:
    """Generate the campaign and save it in one backend-owned workflow."""
    # Supplying a validated gap avoids a provider call; otherwise generation
    # performs one campaign-gap LLM action and consumes the shared quota.
    if payload.gap is None:
        enforce_ai_action(request, access)
    try:
        campaign, gap = CampaignGenerationService(db, provider).generate(
            client_id, payload
        )
    except CampaignGenerationError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except CampaignReferenceError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return CampaignGenerationRead(
        campaign=CampaignRead.model_validate(campaign),
        gap=gap,
    )


@router.get("/campaigns", response_model=list[CampaignRead])
def list_campaigns(
    client_id: int,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_access),
) -> list[CampaignRead]:
    return [
        CampaignRead.model_validate(campaign)
        for campaign in CampaignRepository(db).list_campaigns(client_id)
    ]


@router.get("/campaigns/{campaign_id}", response_model=CampaignRead)
def get_campaign(
    client_id: int,
    campaign_id: int,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_access),
) -> CampaignRead:
    campaign = CampaignRepository(db).get_campaign(client_id, campaign_id)
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return CampaignRead.model_validate(campaign)


@router.patch("/campaigns/{campaign_id}/status", response_model=CampaignRead)
def update_campaign_status(
    client_id: int,
    campaign_id: int,
    payload: CampaignStatusUpdate,
    db: Session = Depends(get_db),
    _: Client = Depends(require_client_review),
) -> CampaignRead:
    repo = CampaignRepository(db)
    campaign = repo.get_campaign(client_id, campaign_id)
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return CampaignRead.model_validate(repo.update_status(campaign, payload))
