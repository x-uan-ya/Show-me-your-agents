"""Dataset 3 campaign parameters and customer-message gap API."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.schemas.campaign_gap import (
    CampaignGapAutoRequest,
    CampaignGapRequest,
    CampaignGapResponse,
    CampaignParameterRead,
)
from app.services.ai.base import AIProvider
from app.services.ai.factory import get_ai_provider
from app.services.campaign_gap.parameters import CampaignParameterError
from app.services.campaign_gap.service import (
    CampaignGapClientNotFoundError,
    CampaignGapNoInsightsError,
    CampaignGapProviderError,
    CampaignGapService,
    CampaignNotFoundError,
    list_campaign_parameters,
)
from app.services.auth.dependencies import (
    AccessContext,
    get_current_access,
    require_client_write,
)
from app.services.rate_limit import enforce_ai_action

router = APIRouter(tags=["campaign-gap"])


@router.get("/campaign-parameters", response_model=list[CampaignParameterRead])
def campaign_parameters(
    _: AccessContext = Depends(get_current_access),
) -> list[CampaignParameterRead]:
    try:
        return list_campaign_parameters()
    except CampaignParameterError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc


@router.post(
    "/clients/{client_id}/campaign-gap", response_model=CampaignGapResponse
)
def analyse_campaign_gap(
    client_id: int,
    payload: CampaignGapRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: AIProvider = Depends(get_ai_provider),
    access: AccessContext = Depends(get_current_access),
    _: Client = Depends(require_client_write),
) -> CampaignGapResponse:
    enforce_ai_action(request, access)
    try:
        return CampaignGapService(db, provider).analyse(client_id, payload.campaign_id)
    except CampaignGapClientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except CampaignNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except CampaignGapNoInsightsError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except CampaignParameterError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    except CampaignGapProviderError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"AI provider failed: {exc}"
        ) from exc


@router.post(
    "/clients/{client_id}/campaign-gap/auto", response_model=CampaignGapResponse
)
def analyse_matching_campaign_gap(
    client_id: int,
    payload: CampaignGapAutoRequest,
    request: Request,
    db: Session = Depends(get_db),
    provider: AIProvider = Depends(get_ai_provider),
    access: AccessContext = Depends(get_current_access),
    _: Client = Depends(require_client_write),
) -> CampaignGapResponse:
    enforce_ai_action(request, access)
    try:
        return CampaignGapService(db, provider).analyse_matching(
            client_id,
            objective=payload.objective,
            target_audience=payload.target_audience,
            active_message=payload.active_message,
            channels=payload.channels,
        )
    except CampaignGapClientNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except CampaignGapNoInsightsError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    except CampaignParameterError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, str(exc)) from exc
    except CampaignGapProviderError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, f"AI provider failed: {exc}"
        ) from exc
