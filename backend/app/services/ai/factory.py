"""AI provider factory.

Selects the concrete provider based on configuration. This is the ONLY place
that knows about all provider implementations, keeping the rest of the codebase
vendor-agnostic.
"""

from functools import lru_cache

from app.config import Settings, get_settings
from app.services.ai.base import AIProvider
from app.services.ai.bedrock_provider import BedrockAIProvider
from app.services.ai.mock_provider import MockAIProvider
from app.services.ai.openai_provider import OpenAIProvider


def build_provider(settings: Settings) -> AIProvider:
    """Construct an AI provider instance from settings."""
    provider = settings.ai_provider
    if provider == "mock":
        return MockAIProvider()
    if provider == "bedrock":
        return BedrockAIProvider(
            region=settings.bedrock_region, model_id=settings.bedrock_model_id
        )
    if provider == "openai":
        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    raise ValueError(f"Unknown AI provider: {provider!r}")


@lru_cache
def get_ai_provider() -> AIProvider:
    """Cached provider instance for use as a FastAPI dependency."""
    return build_provider(get_settings())
