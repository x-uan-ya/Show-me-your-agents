"""ORM models. Importing here ensures they register with the declarative Base."""

from app.models.analysis_run import AnalysisRun
from app.models.client import Client
from app.models.customer_insight import CustomerInsight
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.models.feedback import FeedbackItem
from app.models.insight import Insight
from app.models.insight_evidence import InsightEvidence

__all__ = [
    "AnalysisRun",
    "Client",
    "CustomerInsight",
    "CustomerSignal",
    "Dataset",
    "FeedbackItem",
    "Insight",
    "InsightEvidence",
]
