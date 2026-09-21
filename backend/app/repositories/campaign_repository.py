"""Data access and relationship validation for persisted campaigns."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.analysis_run import AnalysisRun
from app.models.campaign import Campaign, CampaignApproval, CampaignContentItem
from app.models.customer_insight import CustomerInsight
from app.models.marketing_brief import MarketingBrief
from app.schemas.campaign import CampaignCreate, CampaignStatusUpdate, MarketingBriefWrite


class CampaignReferenceError(ValueError):
    """A referenced record is missing or belongs to another client."""


class CampaignRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def get_brief(self, client_id: int) -> MarketingBrief | None:
        stmt = select(MarketingBrief).where(MarketingBrief.client_id == client_id)
        return self._db.scalars(stmt).first()

    def upsert_brief(
        self, client_id: int, payload: MarketingBriefWrite
    ) -> MarketingBrief:
        brief = self.get_brief(client_id)
        if brief is None:
            brief = MarketingBrief(client_id=client_id)
            self._db.add(brief)
        brief.objective = payload.objective.strip()
        brief.target_audience = payload.target_audience.strip()
        brief.current_message = payload.current_message.strip()
        brief.channels = payload.channels
        self._db.commit()
        self._db.refresh(brief)
        return brief

    @staticmethod
    def _campaign_query():
        return select(Campaign).options(
            selectinload(Campaign.content_items),
            selectinload(Campaign.approval),
            selectinload(Campaign.primary_insight),
        )

    def list_campaigns(self, client_id: int) -> list[Campaign]:
        stmt = (
            self._campaign_query()
            .where(Campaign.client_id == client_id)
            .order_by(Campaign.id.desc())
        )
        return list(self._db.scalars(stmt).all())

    def get_campaign(self, client_id: int, campaign_id: int) -> Campaign | None:
        stmt = self._campaign_query().where(
            Campaign.id == campaign_id,
            Campaign.client_id == client_id,
        )
        return self._db.scalars(stmt).first()

    def _validate_references(self, client_id: int, payload: CampaignCreate) -> MarketingBrief:
        brief = self._db.get(MarketingBrief, payload.marketing_brief_id)
        if brief is None or brief.client_id != client_id:
            raise CampaignReferenceError(
                "Marketing brief does not exist for the selected client"
            )
        if not (
            brief.objective.strip()
            and brief.target_audience.strip()
            and brief.channels
        ):
            raise CampaignReferenceError(
                "Marketing brief must include an objective, target audience and channel"
            )

        run: AnalysisRun | None = None
        if payload.analysis_run_id is not None:
            run = self._db.get(AnalysisRun, payload.analysis_run_id)
            if run is None or run.client_id != client_id:
                raise CampaignReferenceError(
                    "Analysis run does not exist for the selected client"
                )

        insight_ids = list(payload.supporting_insight_ids)
        if payload.primary_insight_id is not None:
            insight_ids.append(payload.primary_insight_id)
        for insight_id in dict.fromkeys(insight_ids):
            insight = self._db.get(CustomerInsight, insight_id)
            if insight is None or insight.client_id != client_id:
                raise CampaignReferenceError(
                    f"Insight {insight_id} does not exist for the selected client"
                )
            if run is not None and insight.analysis_run_id != run.id:
                raise CampaignReferenceError(
                    f"Insight {insight_id} does not belong to analysis run {run.id}"
                )
        return brief

    def create_campaign(self, client_id: int, payload: CampaignCreate) -> Campaign:
        brief = self._validate_references(client_id, payload)
        campaign = Campaign(
            client_id=client_id,
            marketing_brief_id=brief.id,
            analysis_run_id=payload.analysis_run_id,
            primary_insight_id=payload.primary_insight_id,
            supporting_insight_ids=payload.supporting_insight_ids,
            name=payload.name.strip(),
            objective=brief.objective,
            target_audience=brief.target_audience,
            key_message=payload.key_message.strip(),
            message_gap=payload.message_gap.strip() if payload.message_gap else None,
            cta=payload.cta,
            kpi=payload.kpi,
            status=payload.status,
            start_date=payload.start_date,
            end_date=payload.end_date,
            strategy_payload=payload.strategy_payload,
        )
        self._db.add(campaign)
        self._db.flush()
        for item in payload.content_items:
            self._db.add(
                CampaignContentItem(
                    campaign_id=campaign.id,
                    channel=item.channel.strip(),
                    content=item.content.strip(),
                    content_type=item.content_type.strip() if item.content_type else None,
                    cta=item.cta.strip() if item.cta else None,
                    sequence_day=item.sequence_day,
                    publish_date=item.publish_date,
                    owner=item.owner.strip() if item.owner else None,
                    status=item.status,
                )
            )
        self._db.add(CampaignApproval(campaign_id=campaign.id, status="pending"))
        self._db.commit()
        persisted = self.get_campaign(client_id, campaign.id)
        assert persisted is not None
        return persisted

    def update_status(
        self, campaign: Campaign, payload: CampaignStatusUpdate
    ) -> Campaign:
        campaign.status = payload.status
        approval = campaign.approval
        if approval is None:
            approval = CampaignApproval(campaign_id=campaign.id)
            self._db.add(approval)
        approval.status = {
            "draft": "pending",
            "approved": "approved",
            "revision_requested": "revision_requested",
        }[payload.status]
        approval.reviewer = payload.reviewer.strip() if payload.reviewer else None
        approval.revision_comment = (
            payload.revision_comment.strip() if payload.revision_comment else None
        )
        approval.decided_at = (
            None if payload.status == "draft" else datetime.now(timezone.utc)
        )
        self._db.commit()
        persisted = self.get_campaign(campaign.client_id, campaign.id)
        assert persisted is not None
        return persisted
