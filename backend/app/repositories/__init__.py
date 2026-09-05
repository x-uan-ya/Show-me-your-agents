"""Repository layer: encapsulates database access."""

from app.repositories.client_repository import ClientRepository
from app.repositories.feedback_repository import FeedbackRepository
from app.repositories.insight_repository import InsightRepository

__all__ = ["ClientRepository", "FeedbackRepository", "InsightRepository"]
