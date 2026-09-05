"""Application configuration.

Configuration is intentionally data-source-independent. Nothing here assumes a
specific SME, dataset, or AI provider. The AI provider is selected via the
``AI_PROVIDER`` setting and defaults to ``mock`` so the system runs with no
external API keys.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AIProvider = Literal["mock", "hackathon"]


class Settings(BaseSettings):
    """Runtime configuration loaded from environment / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # General
    app_name: str = "Customer Insight Intelligence"
    environment: str = Field(default="development")
    api_prefix: str = "/api"

    # Database (SQLite for development, swappable via env)
    database_url: str = Field(default="sqlite:///./customer_insight.db")

    # CORS: comma-separated list of allowed origins for the frontend.
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    # AI provider selection. MOCK works with no external credentials.
    # "hackathon" targets the organiser-provided JSON API backed by AWS Bedrock
    # (Claude Sonnet 4.5) and is not implemented until their spec is shared.
    ai_provider: AIProvider = Field(default="mock")

    # Placeholders for the organiser-provided hackathon API. Their exact names,
    # shape, and auth scheme are unknown until the organiser confirms via Slack,
    # so these are provisional and unused in mock mode.
    hackathon_api_base_url: str | None = Field(default=None)
    hackathon_api_key: str | None = Field(default=None)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
