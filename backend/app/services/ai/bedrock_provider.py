"""AWS Bedrock AI provider (stub).

This is a placeholder implementation for the pre-SME foundation. The concrete
Bedrock call is intentionally not wired up yet so the project has no hard
dependency on AWS. When enabled, it will use the Converse API via boto3. Until
then it raises a clear error so misconfiguration is obvious rather than silent.
"""

from app.schemas.insight import InsightClassification
from app.services.ai.base import AIProvider


class BedrockAIProvider(AIProvider):
    name = "bedrock"

    def __init__(self, region: str, model_id: str) -> None:
        self._region = region
        self._model_id = model_id

    def classify_feedback(self, content: str) -> list[InsightClassification]:
        raise NotImplementedError(
            "Bedrock provider is not implemented yet. Set AI_PROVIDER=mock for "
            "local development, or implement classify_feedback using the Bedrock "
            "Converse API before enabling this provider."
        )

    def health(self) -> bool:
        # Not ready until implemented.
        return False
