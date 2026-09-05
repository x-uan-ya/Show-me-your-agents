"""OpenAI AI provider (stub).

Placeholder for the pre-SME foundation. No hard dependency on the OpenAI SDK is
introduced. When enabled it will call the Chat Completions / Responses API using
the configured key and model. Until then it raises a clear error.
"""

from app.schemas.insight import InsightClassification
from app.services.ai.base import AIProvider


class OpenAIProvider(AIProvider):
    name = "openai"

    def __init__(self, api_key: str | None, model: str) -> None:
        self._api_key = api_key
        self._model = model

    def classify_feedback(self, content: str) -> list[InsightClassification]:
        raise NotImplementedError(
            "OpenAI provider is not implemented yet. Set AI_PROVIDER=mock for "
            "local development, or implement classify_feedback using the OpenAI "
            "API before enabling this provider."
        )

    def health(self) -> bool:
        return bool(self._api_key)
