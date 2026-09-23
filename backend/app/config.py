"""Application configuration.

Configuration is intentionally data-source-independent. Nothing here assumes a
specific SME, dataset, or AI provider. The AI provider is selected via the
``AI_PROVIDER`` setting and defaults to ``mock`` so the system runs with no
external API keys.
"""

from functools import lru_cache
from ipaddress import ip_network
from typing import Literal

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

AIProvider = Literal["mock", "hackathon"]
EmailDelivery = Literal["console", "smtp"]

DEVELOPMENT_AUTH_SECRET = "development-only-change-this-secret"
MIN_PRODUCTION_AUTH_SECRET_LENGTH = 32


class ProductionConfigurationError(RuntimeError):
    """Raised when production would start with an unsafe configuration."""


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
    auth_secret: SecretStr = Field(default=DEVELOPMENT_AUTH_SECRET)
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

    # Process-local abuse protection. The deployed Lightsail service currently
    # runs at scale=1; horizontal scaling requires a shared limiter backend.
    rate_limit_enabled: bool = Field(default=True)
    rate_limit_trusted_proxy_cidrs: str = Field(default="")
    login_ip_limit: int = Field(default=10, ge=1, le=10_000)
    login_ip_window_seconds: int = Field(default=60, ge=1, le=86_400)
    login_account_limit: int = Field(default=5, ge=1, le=10_000)
    login_account_window_seconds: int = Field(default=600, ge=1, le=86_400)
    register_ip_limit: int = Field(default=5, ge=1, le=10_000)
    register_ip_window_seconds: int = Field(default=3_600, ge=1, le=86_400)
    register_email_limit: int = Field(default=3, ge=1, le=10_000)
    register_email_window_seconds: int = Field(default=3_600, ge=1, le=86_400)
    otp_email_limit: int = Field(default=5, ge=1, le=10_000)
    otp_email_window_seconds: int = Field(default=3_600, ge=1, le=86_400)
    otp_ip_limit: int = Field(default=10, ge=1, le=10_000)
    otp_ip_window_seconds: int = Field(default=3_600, ge=1, le=86_400)
    otp_verify_email_limit: int = Field(default=10, ge=1, le=10_000)
    otp_verify_ip_limit: int = Field(default=30, ge=1, le=10_000)
    otp_verify_window_seconds: int = Field(default=600, ge=1, le=86_400)
    ai_user_limit: int = Field(default=10, ge=1, le=10_000)
    ai_workspace_limit: int = Field(default=30, ge=1, le=10_000)
    ai_rate_limit_window_seconds: int = Field(default=3_600, ge=1, le=86_400)

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

    @field_validator("rate_limit_trusted_proxy_cidrs")
    @classmethod
    def validate_trusted_proxy_cidrs(cls, value: str) -> str:
        entries = [entry.strip() for entry in value.split(",") if entry.strip()]
        for entry in entries:
            try:
                ip_network(entry, strict=False)
            except ValueError as exc:
                raise ValueError(f"Invalid trusted proxy CIDR: {entry}") from exc
        return ",".join(entries)

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def _looks_like_placeholder(value: str) -> bool:
    normalized = value.strip().casefold().replace("-", "_")
    return any(
        marker in normalized
        for marker in (
            "placeholder",
            "replace_with",
            "set_at_deploy_time",
        )
    )


def validate_production_settings(settings: Settings) -> None:
    """Fail closed before startup when production security settings are unsafe.

    Development defaults intentionally remain convenient for localhost. Production
    must explicitly provide its authentication secret and CORS allowlist and must
    use encrypted, authenticated SMTP delivery for OTP messages.
    """

    if settings.environment.strip().casefold() != "production":
        return

    errors: list[str] = []
    explicitly_set = settings.model_fields_set
    auth_secret = settings.auth_secret.get_secret_value()

    if "auth_secret" not in explicitly_set:
        errors.append("AUTH_SECRET must be explicitly set in production")
    elif auth_secret == DEVELOPMENT_AUTH_SECRET:
        errors.append("AUTH_SECRET must not use the development default in production")
    elif (
        len(auth_secret) < MIN_PRODUCTION_AUTH_SECRET_LENGTH
        or len(set(auth_secret)) < 8
        or _looks_like_placeholder(auth_secret)
    ):
        errors.append(
            "AUTH_SECRET is too weak for production; use at least 32 random characters"
        )

    if not settings.auth_cookie_secure:
        errors.append("AUTH_COOKIE_SECURE must be true in production")

    if not settings.rate_limit_enabled:
        errors.append("RATE_LIMIT_ENABLED must be true in production")

    origins = settings.cors_origin_list
    if "cors_origins" not in explicitly_set or not origins:
        errors.append("CORS_ORIGINS must be an explicit non-empty allowlist in production")
    elif any("*" in origin for origin in origins):
        errors.append("CORS_ORIGINS must not contain '*' when credentials are enabled")
    elif any(_looks_like_placeholder(origin) for origin in origins):
        errors.append("CORS_ORIGINS contains an unresolved deployment placeholder")

    if settings.email_delivery != "smtp":
        errors.append("EMAIL_DELIVERY must be 'smtp'; console OTP is disabled in production")
    else:
        smtp_password = (
            settings.smtp_password.get_secret_value()
            if settings.smtp_password is not None
            else ""
        )
        required_smtp_values = {
            "SMTP_HOST": settings.smtp_host or "",
            "SMTP_USERNAME": settings.smtp_username or "",
            "SMTP_PASSWORD": smtp_password,
            "SMTP_FROM_EMAIL": settings.smtp_from_email,
        }
        for name, value in required_smtp_values.items():
            if not value.strip() or _looks_like_placeholder(value):
                errors.append(f"{name} must be explicitly configured for production OTP")

        from_email = settings.smtp_from_email.strip().casefold()
        from_local, separator, from_domain = from_email.rpartition("@")
        if (
            not separator
            or not from_local
            or not from_domain
            or from_email.count("@") != 1
            or from_domain == "localhost"
            or from_domain.endswith(".localhost")
        ):
            errors.append("SMTP_FROM_EMAIL must be a valid non-local production address")
        if not settings.smtp_use_tls and not settings.smtp_use_ssl:
            errors.append("SMTP_USE_TLS or SMTP_USE_SSL must be true in production")

    if errors:
        details = "\n".join(f"- {message}" for message in errors)
        raise ProductionConfigurationError(
            f"Unsafe production configuration; application startup aborted:\n{details}"
        )


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
