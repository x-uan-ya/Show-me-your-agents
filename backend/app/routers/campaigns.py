"""Client-scoped persistence endpoints for briefs and campaigns."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.repositories.campaign_repository import CampaignReferenceError, CampaignRepository
from app.schemas.campaign import (
    CampaignCreate,
    CampaignRead,
    CampaignStatusUpdate,
    MarketingBriefRead,
    MarketingBriefWrite,
)

router = APIRouter(prefix="/clients/{client_id}", tags=["campaigns"])


def _require_client(db: Session, client_id: int) -> None:
    if db.get(Client, client_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Client {client_id} not found",
        )


@router.put("/marketing-brief", response_model=MarketingBriefRead)
def save_marketing_brief(
    client_id: int,
    payload: MarketingBriefWrite,
    db: Session = Depends(get_db),
) -> MarketingBriefRead:
    _require_client(db, client_id)
    brief = CampaignRepository(db).upsert_brief(client_id, payload)
    return MarketingBriefRead.model_validate(brief)


@router.get("/marketing-brief", response_model=MarketingBriefRead | None)
def get_marketing_brief(
    client_id: int,
    db: Session = Depends(get_db),
) -> MarketingBriefRead | None:
    _require_client(db, client_id)
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
) -> CampaignRead:
    _require_client(db, client_id)
    try:
        campaign = CampaignRepository(db).create_campaign(client_id, payload)
    except CampaignReferenceError as exc:
        raise HTTPException(422, str(exc)) from exc
    return CampaignRead.model_validate(campaign)


@router.get("/campaigns", response_model=list[CampaignRead])
def list_campaigns(
    client_id: int,
    db: Session = Depends(get_db),
) -> list[CampaignRead]:
    _require_client(db, client_id)
    return [
        CampaignRead.model_validate(campaign)
        for campaign in CampaignRepository(db).list_campaigns(client_id)
    ]


@router.get("/campaigns/{campaign_id}", response_model=CampaignRead)
def get_campaign(
    client_id: int,
    campaign_id: int,
    db: Session = Depends(get_db),
) -> CampaignRead:
    _require_client(db, client_id)
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
) -> CampaignRead:
    _require_client(db, client_id)
    repo = CampaignRepository(db)
    campaign = repo.get_campaign(client_id, campaign_id)
    if campaign is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    return CampaignRead.model_validate(repo.update_status(campaign, payload))
