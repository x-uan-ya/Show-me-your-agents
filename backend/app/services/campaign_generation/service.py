"""Generate and persist an evidence-linked campaign on the backend."""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis_run import AnalysisRun
from app.models.campaign import Campaign
from app.models.client import Client
from app.models.customer_insight import CustomerInsight
from app.models.marketing_brief import MarketingBrief
from app.repositories.campaign_repository import (
    CampaignReferenceError,
    CampaignRepository,
)
from app.schemas.campaign import (
    CampaignCreate,
    CampaignGenerateRequest,
)
from app.schemas.campaign_gap import CampaignGapResponse
from app.services.ai.base import AIProvider
from app.services.campaign_gap.service import CampaignGapService


class CampaignGenerationError(ValueError):
    """The selected client does not have enough valid data to generate a plan."""


def _cta(objective: str) -> str:
    value = objective.casefold()
    if "sign-up" in value or "signup" in value:
        return "Sign up today"
    if "trial" in value or "try" in value:
        return "Try it today"
    if "order" in value or "sales" in value:
        return "Order now"
    if "traffic" in value or "visit" in value:
        return "Plan your visit"
    if "retention" in value or "repeat" in value:
        return "Come back and experience it again"
    return "Take the next step"


def _kpi(objective: str) -> str:
    value = objective.casefold()
    if "sign-up" in value or "signup" in value:
        return "Qualified campaign sign-ups"
    if "trial" in value or "try" in value:
        return "First-time trials attributed to the campaign"
    if "traffic" in value or "visit" in value:
        return "Campaign-attributed visits during the target period"
    if "retention" in value or "repeat" in value:
        return "Repeat engagement or repeat-purchase rate"
    if "sales" in value or "revenue" in value:
        return "Campaign-attributed conversions and revenue"
    return f'Primary conversions tied to “{objective}”'


def _rank(insights: list[CustomerInsight]) -> list[CustomerInsight]:
    return sorted(
        insights,
        key=lambda insight: (
            insight.evidence_count > 0,
            insight.confidence,
            insight.evidence_count,
            -insight.id,
        ),
        reverse=True,
    )


def _first_category(
    insights: list[CustomerInsight], categories: set[str]
) -> CustomerInsight | None:
    return next((item for item in insights if item.category in categories), None)


class CampaignGenerationService:
    def __init__(self, db: Session, provider: AIProvider) -> None:
        self._db = db
        self._provider = provider
        self._campaigns = CampaignRepository(db)

    def generate(
        self, client_id: int, payload: CampaignGenerateRequest
    ) -> tuple[Campaign, CampaignGapResponse]:
        client = self._db.get(Client, client_id)
        if client is None:
            raise CampaignGenerationError(f"Client {client_id} not found")

        brief = self._db.get(MarketingBrief, payload.marketing_brief_id)
        if brief is None or brief.client_id != client_id:
            raise CampaignReferenceError(
                "Marketing brief does not exist for the selected client"
            )
        if not (brief.objective.strip() and brief.target_audience.strip() and brief.channels):
            raise CampaignGenerationError(
                "Marketing brief must include an objective, target audience and channel"
            )

        run: AnalysisRun | None = None
        if payload.analysis_run_id is not None:
            run = self._db.get(AnalysisRun, payload.analysis_run_id)
            if run is None or run.client_id != client_id:
                raise CampaignReferenceError(
                    "Analysis run does not exist for the selected client"
                )

        query = select(CustomerInsight).where(CustomerInsight.client_id == client_id)
        if run is not None:
            query = query.where(CustomerInsight.analysis_run_id == run.id)
        insights = _rank(list(self._db.scalars(query).all()))
        if not insights:
            raise CampaignGenerationError(
                "Analyse customer feedback before generating a campaign"
            )

        primary = next(
            (item for item in insights if item.id == payload.primary_insight_id),
            insights[0],
        )
        if run is None:
            run = self._db.get(AnalysisRun, primary.analysis_run_id)

        if payload.gap is not None:
            if payload.gap.client_id != client_id:
                raise CampaignReferenceError(
                    "Campaign gap analysis does not belong to the selected client"
                )
            gap = payload.gap
        else:
            gap = CampaignGapService(self._db, self._provider).analyse_matching(
                client_id,
                objective=brief.objective,
                target_audience=brief.target_audience,
                active_message=brief.current_message,
                channels=brief.channels,
            )

        concern = _first_category(
            insights,
            {"PAIN_POINT", "CUSTOMER_ANXIETY", "NON_REPEAT_DRIVER", "UNMET_NEED"},
        )
        matched_value = gap.analysis.matched_customer_values[0] if gap.analysis.matched_customer_values else primary.title
        message_gap = (
            gap.analysis.message_gaps[0]
            if gap.analysis.message_gaps
            else f"Connect “{brief.current_message}” more directly to “{primary.title}”."
        )
        recommended_message = f"{matched_value}. {primary.summary}"
        channels = brief.channels
        cta = _cta(brief.objective)
        actions = gap.analysis.recommended_actions
        valid_insight_ids = {item.id for item in insights}
        supporting_insight_ids = [
            insight_id
            for insight_id in dict.fromkeys([
                primary.id,
                *gap.analysis.supporting_insight_ids,
                *payload.supporting_insight_ids,
            ])
            if insight_id in valid_insight_ids
        ][:128]
        content = [
            (1, channels[0], f"Customer proof: {matched_value}", "Awareness", None),
            (
                3,
                channels[1 % len(channels)],
                f"Address the concern: {gap.analysis.message_gaps[0] if gap.analysis.message_gaps else (concern.title if concern else 'Answer the most important customer concern')}",
                "Trust",
                None,
            ),
            (
                5,
                channels[2 % len(channels)],
                actions[0] if actions else "Show the offer in use with a clear next step",
                "Consideration",
                cta,
            ),
            (7, channels[0], "Invite feedback and capture the next customer signal", "Learning loop", None),
        ]
        campaign_start = payload.start_date or date.today()
        campaign_end = campaign_start + timedelta(days=6)
        campaign = self._campaigns.create_campaign(
            client_id,
            CampaignCreate(
                marketing_brief_id=brief.id,
                analysis_run_id=run.id if run else primary.analysis_run_id,
                primary_insight_id=primary.id,
                supporting_insight_ids=supporting_insight_ids,
                name=f"{client.name} · {primary.title}",
                key_message=recommended_message,
                message_gap=message_gap,
                cta=cta,
                kpi=_kpi(brief.objective),
                start_date=campaign_start,
                end_date=campaign_end,
                strategy_payload={
                    "generated_by": "backend",
                    "current_message": brief.current_message,
                    "gap_analysis": gap.analysis.model_dump(),
                },
                content_items=[
                    {
                        "channel": channel,
                        "content": text,
                        "content_type": purpose,
                        "cta": item_cta,
                        "sequence_day": day,
                        "publish_date": campaign_start + timedelta(days=day - 1),
                        "status": "draft",
                    }
                    for day, channel, text, purpose, item_cta in content
                ],
            ),
        )
        return campaign, gap
