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

    # Confidence display thresholds (configurable). Confidence is stored 0-1
    # internally and shown as a qualitative band, never as a scientific
    # probability. >= high => "High"; >= medium (and < high) => "Medium";
    # otherwise "Low".
    confidence_high_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    confidence_medium_threshold: float = Field(default=0.50, ge=0.0, le=1.0)

    # Evidence-quality thresholds (configurable). All rules that raise flags use
    # these so the assessment stays transparent and adjustable.
    # LIMITED_EVIDENCE: fewer than this many independent supporting signals.
    evidence_min_independent: int = Field(default=3, ge=1)
    # SMALL_SAMPLE: analysed dataset has fewer than this many signals total.
    evidence_min_dataset_sample: int = Field(default=30, ge=1)
    # SOURCE_CONCENTRATION: one source accounts for more than this fraction of
    # the supporting evidence (only meaningful with 2+ evidence items).
    evidence_source_concentration_ratio: float = Field(default=0.8, ge=0.0, le=1.0)
    # LIMITED_CONTEXT: fewer than this fraction of supporting signals carry
    # contextual fields (source / date / product).
    evidence_min_context_ratio: float = Field(default=0.5, ge=0.0, le=1.0)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
