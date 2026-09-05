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

AIProvider = Literal["mock", "bedrock", "openai"]


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
    ai_provider: AIProvider = Field(default="mock")

    # Optional provider-specific settings (unused in mock mode).
    openai_api_key: str | None = Field(default=None)
    openai_model: str = Field(default="gpt-4o-mini")

    bedrock_region: str = Field(default="us-east-1")
    bedrock_model_id: str = Field(default="anthropic.claude-3-5-sonnet-20240620-v1:0")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
