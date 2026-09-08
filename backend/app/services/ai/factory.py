"""AI provider factory.

Selects the concrete provider based on configuration. This is the ONLY place
that knows about all provider implementations, keeping the rest of the codebase
vendor-agnostic. Two providers exist: the deterministic local mock, and the
organiser-provided hackathon provider (skeleton until their spec arrives).
"""

from functools import lru_cache

from app.config import Settings, get_settings
from app.services.ai.base import AIProvider
from app.services.ai.hackathon_provider import HackathonAIProvider
from app.services.ai.mock_provider import MockAIProvider


def build_provider(settings: Settings) -> AIProvider:
    """Construct an AI provider instance from settings."""
    provider = settings.ai_provider
    if provider == "mock":
        return MockAIProvider()
    if provider == "hackathon":
        return HackathonAIProvider(
            api_base_url=settings.hackathon_api_base_url,
            api_key=settings.hackathon_api_key,
            model=settings.hackathon_model,
            timeout_seconds=settings.hackathon_timeout_seconds,
        )
    raise ValueError(f"Unknown AI provider: {provider!r}")


@lru_cache
def get_ai_provider() -> AIProvider:
    """Cached provider instance for use as a FastAPI dependency."""
    return build_provider(get_settings())
