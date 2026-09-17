"""Customer-message gap orchestration for Dataset 3."""

from __future__ import annotations

from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.repositories.client_repository import ClientRepository
from app.schemas.campaign_gap import CampaignGapResponse, CampaignParameterRead
from app.services.ai.base import AIProvider, CampaignGapInput, CampaignInsightInput
from app.services.campaign_gap.parameters import (
    CampaignParameterError,
    CampaignParameters,
    load_campaign_parameters_csv,
)
from app.services.insight_engine.insight_context import InsightContextService


class CampaignGapClientNotFoundError(Exception):
    pass


class CampaignNotFoundError(Exception):
    pass


class CampaignGapNoInsightsError(Exception):
    pass


class CampaignGapProviderError(Exception):
    pass


def _parameter_read(record: CampaignParameters) -> CampaignParameterRead:
    return CampaignParameterRead(
        campaign_id=record.campaign_id,
        objective=record.objective,
        target_audience=record.target_audience,
        active_message=record.active_message,
        channel=record.channel,
    )


def list_campaign_parameters() -> list[CampaignParameterRead]:
    return [_parameter_read(record) for record in load_campaign_parameters_csv()]


class CampaignGapService:
    def __init__(self, db: Session, provider: AIProvider) -> None:
        self._db = db
        self._provider = provider

    def analyse(self, client_id: int, campaign_id: str) -> CampaignGapResponse:
        if ClientRepository(self._db).get(client_id) is None:
            raise CampaignGapClientNotFoundError(f"Client {client_id} not found.")

        try:
            records = load_campaign_parameters_csv()
        except CampaignParameterError:
            raise
        campaign = next(
            (record for record in records if record.campaign_id == campaign_id.strip()),
            None,
        )
        if campaign is None:
            raise CampaignNotFoundError(f"Campaign {campaign_id!r} not found.")

        return self._analyse_campaign(client_id, campaign)

    def analyse_matching(
        self,
        client_id: int,
        *,
        objective: str,
        target_audience: str,
        active_message: str,
        channels: list[str],
    ) -> CampaignGapResponse:
        """Match the current brief to Dataset 3, then run the gap analysis."""
        if ClientRepository(self._db).get(client_id) is None:
            raise CampaignGapClientNotFoundError(f"Client {client_id} not found.")

        records = load_campaign_parameters_csv()
        channel_keys = {channel.casefold().strip() for channel in channels}

        def similarity(record: CampaignParameters) -> float:
            objective_score = SequenceMatcher(
                None, objective.casefold(), record.objective.casefold()
            ).ratio()
            audience_score = SequenceMatcher(
                None, target_audience.casefold(), record.target_audience.casefold()
            ).ratio()
            message_score = (
                SequenceMatcher(
                    None, active_message.casefold(), record.active_message.casefold()
                ).ratio()
                if active_message.strip()
                else 0.0
            )
            channel_score = 1.0 if record.channel.casefold() in channel_keys else 0.0
            return (
                objective_score * 0.4
                + audience_score * 0.25
                + message_score * 0.2
                + channel_score * 0.15
            )

        campaign = max(records, key=similarity)
        return self._analyse_campaign(client_id, campaign)

    def _analyse_campaign(
        self, client_id: int, campaign: CampaignParameters
    ) -> CampaignGapResponse:
        context = InsightContextService(self._db).build(client_id)
        groups = (
            context.purchase_drivers,
            context.trial_drivers,
            context.retention_drivers,
            context.non_repeat_drivers,
            context.pain_points,
            context.unmet_needs,
            context.customer_anxieties,
            context.emerging_demand,
        )
        insights = [
            CampaignInsightInput(
                id=insight.insight_id,
                category=insight.category.value,
                title=insight.title,
                summary=insight.summary,
            )
            for group in groups
            for insight in group
        ]
        if not insights:
            raise CampaignGapNoInsightsError(
                "Analyse customer feedback before running campaign-gap detection."
            )

        try:
            analysis = self._provider.analyze_campaign_gap(
                CampaignGapInput(
                    campaign_id=campaign.campaign_id,
                    objective=campaign.objective,
                    target_audience=campaign.target_audience,
                    active_message=campaign.active_message,
                    channel=campaign.channel,
                ),
                insights,
            )
        except Exception as exc:
            raise CampaignGapProviderError(str(exc)) from exc

        return CampaignGapResponse(
            client_id=client_id,
            campaign=_parameter_read(campaign),
            analysis=analysis,
        )
