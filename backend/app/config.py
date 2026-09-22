"""Application configuration.

Configuration is intentionally data-source-independent. Nothing here assumes a
specific SME, dataset, or AI provider. The AI provider is selected via the
``AI_PROVIDER`` setting and defaults to ``mock`` so the system runs with no
external API keys.
"""

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

AIProvider = Literal["mock", "hackathon"]
EmailDelivery = Literal["console", "smtp"]


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

    # Local authentication. Production deployments must override AUTH_SECRET.
    auth_secret: SecretStr = Field(default="development-only-change-this-secret")
    auth_cookie_name: str = Field(default="smy_agents_session")
    auth_session_seconds: int = Field(default=8 * 60 * 60, ge=300, le=30 * 24 * 60 * 60)
    auth_cookie_secure: bool = Field(default=False)

    # Email OTP delivery. Console delivery is restricted to local/test use;
    # production deployments should use SMTP and keep credentials in .env.
    email_delivery: EmailDelivery = Field(default="console")
    smtp_host: str | None = Field(default=None)
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_username: str | None = Field(default=None)
    smtp_password: SecretStr | None = Field(default=None)
    smtp_from_email: str = Field(default="no-reply@localhost")
    smtp_from_name: str = Field(default="Campaign Intelligence")
    smtp_use_tls: bool = Field(default=True)
    smtp_use_ssl: bool = Field(default=False)
    smtp_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    email_otp_expiry_minutes: int = Field(default=10, ge=2, le=30)
    email_otp_resend_seconds: int = Field(default=60, ge=15, le=600)
    email_otp_max_attempts: int = Field(default=5, ge=3, le=10)

    # CORS: comma-separated list of allowed origins for the frontend.
    cors_origins: str = Field(default="http://localhost:5173,http://127.0.0.1:5173")

    # Serve the built frontend (Vite `dist/`) from FastAPI so the whole app runs
    # as a single service on one origin (single-instance deployment). If the
    # directory does not exist (e.g. during local split dev), static serving is
    # simply skipped. Default points at ../frontend/dist relative to backend/.
    serve_frontend: bool = Field(default=True)
    frontend_dist_dir: str = Field(default="../frontend/dist")

    # AI provider selection. MOCK works with no external credentials.
    # "hackathon" targets the organiser-provided JSON API backed by AWS Bedrock
    # (Claude Sonnet 4.5) and is not implemented until their spec is shared.
    ai_provider: AIProvider = Field(default="mock")

    # Organiser-provided hackathon gateway (Ollama-native API fronting AWS
    # Bedrock Claude Sonnet 4.5). Only used when AI_PROVIDER=hackathon. Env var
    # names match the organiser's convention (LLM_GATEWAY_URL / LLM_GATEWAY_API_KEY
    # / LLM_MODEL); the HACKATHON_* names are also accepted as aliases.
    hackathon_api_base_url: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_GATEWAY_URL", "HACKATHON_API_BASE_URL"),
    )
    hackathon_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices("LLM_GATEWAY_API_KEY", "HACKATHON_API_KEY"),
    )
    hackathon_model: str = Field(
        default="global.anthropic.claude-sonnet-4-5-20250929-v1:0",
        validation_alias=AliasChoices("LLM_MODEL", "HACKATHON_MODEL"),
    )
    # Request timeout (seconds) for gateway calls.
    hackathon_timeout_seconds: float = Field(default=60.0, gt=0)

    # Bound the total customer text sent in one model request. The upload
    # endpoint has its own byte limit; analysis does not impose a row limit.
    analysis_max_input_chars: int = Field(default=100_000, ge=1, le=10_000_000)

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
