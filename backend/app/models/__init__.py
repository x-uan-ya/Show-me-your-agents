"""ORM models. Importing here ensures they register with the declarative Base."""

from app.models.analysis_run import AnalysisRun
from app.models.campaign import Campaign, CampaignApproval, CampaignContentItem
from app.models.client import Client
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.models.email_otp import EmailOtpChallenge
from app.models.feedback import FeedbackItem
from app.models.insight import Insight
from app.models.insight_evidence import InsightEvidence
from app.models.marketing_brief import MarketingBrief
from app.models.user import ClientMembership, User
from app.models.workspace import Workspace, WorkspaceMembership

__all__ = [
    "AnalysisRun",
    "Campaign",
    "CampaignApproval",
    "CampaignContentItem",
    "Client",
    "CustomerInsight",
    "CustomerSignal",
    "Dataset",
    "EmailOtpChallenge",
    "FeedbackItem",
    "Insight",
    "InsightEvidence",
    "MarketingBrief",
    "ClientMembership",
    "User",
    "Workspace",
    "WorkspaceMembership",
]
