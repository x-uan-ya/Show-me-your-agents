"""Production startup refuses development defaults and incomplete delivery config."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import main as main_module
from app.config import (
    DEVELOPMENT_AUTH_SECRET,
    ProductionConfigurationError,
    Settings,
)


VALID_PRODUCTION_VALUES = {
    "environment": "production",
    "auth_secret": "Prod-Test_7Nq4!mZ8#sR2@vK6$xC9&pL3",
    "auth_cookie_secure": True,
    "cors_origins": "https://app.example.com",
    "email_delivery": "smtp",
    "smtp_host": "smtp.mail-provider.com",
    "smtp_username": "mailer-user",
    "smtp_password": "smtp-test-password",
    "smtp_from_email": "no-reply@company.com",
    "smtp_use_tls": True,
    "smtp_use_ssl": False,
}


def _settings(**overrides) -> Settings:
    values = {**VALID_PRODUCTION_VALUES, **overrides}
    return Settings(_env_file=None, **values)


def _settings_without(*names: str) -> Settings:
    values = dict(VALID_PRODUCTION_VALUES)
    for name in names:
        values.pop(name)
    return Settings(_env_file=None, **values)


def _settings_from_environment(monkeypatch: pytest.MonkeyPatch) -> Settings:
    environment_values = {
        "ENVIRONMENT": VALID_PRODUCTION_VALUES["environment"],
        "AUTH_SECRET": VALID_PRODUCTION_VALUES["auth_secret"],
        "AUTH_COOKIE_SECURE": "true",
        "CORS_ORIGINS": VALID_PRODUCTION_VALUES["cors_origins"],
        "EMAIL_DELIVERY": VALID_PRODUCTION_VALUES["email_delivery"],
        "SMTP_HOST": VALID_PRODUCTION_VALUES["smtp_host"],
        "SMTP_USERNAME": VALID_PRODUCTION_VALUES["smtp_username"],
        "SMTP_PASSWORD": VALID_PRODUCTION_VALUES["smtp_password"],
        "SMTP_FROM_EMAIL": VALID_PRODUCTION_VALUES["smtp_from_email"],
        "SMTP_USE_TLS": "true",
        "SMTP_USE_SSL": "false",
    }
    for name, value in environment_values.items():
        monkeypatch.setenv(name, str(value))
    return Settings(_env_file=None)


def _assert_startup_fails(
    monkeypatch: pytest.MonkeyPatch,
    settings: Settings,
    expected_message: str,
) -> None:
    init_calls: list[bool] = []
    monkeypatch.setattr(main_module, "settings", settings)
    monkeypatch.setattr(main_module, "init_db", lambda: init_calls.append(True))

    with pytest.raises(ProductionConfigurationError, match=expected_message):
        with TestClient(main_module.app):
            pass

    assert init_calls == []


def test_production_startup_rejects_default_auth_secret(monkeypatch):
    _assert_startup_fails(
        monkeypatch,
        _settings(auth_secret=DEVELOPMENT_AUTH_SECRET),
        "development default",
    )


def test_production_startup_rejects_missing_auth_secret(monkeypatch):
    _assert_startup_fails(
        monkeypatch,
        _settings_without("auth_secret"),
        "AUTH_SECRET must be explicitly set",
    )


@pytest.mark.parametrize("weak_secret", ["short-secret", "a" * 32])
def test_production_startup_rejects_weak_auth_secret(monkeypatch, weak_secret):
    _assert_startup_fails(
        monkeypatch,
        _settings(auth_secret=weak_secret),
        "AUTH_SECRET is too weak",
    )


def test_production_startup_rejects_insecure_cookie(monkeypatch):
    _assert_startup_fails(
        monkeypatch,
        _settings(auth_cookie_secure=False),
        "AUTH_COOKIE_SECURE must be true",
    )


@pytest.mark.parametrize("cors_origins", ["*", "https://app.example.com,*", ""])
def test_production_startup_rejects_wildcard_or_empty_cors(monkeypatch, cors_origins):
    _assert_startup_fails(
        monkeypatch,
        _settings(cors_origins=cors_origins),
        "CORS_ORIGINS",
    )


def test_production_startup_rejects_console_otp(monkeypatch):
    _assert_startup_fails(
        monkeypatch,
        _settings(email_delivery="console"),
        "console OTP is disabled",
    )


def test_production_startup_rejects_disabled_rate_limiting(monkeypatch):
    _assert_startup_fails(
        monkeypatch,
        _settings(rate_limit_enabled=False),
        "RATE_LIMIT_ENABLED must be true",
    )


@pytest.mark.parametrize(
    ("setting_name", "expected_message"),
    [
        ("smtp_host", "SMTP_HOST"),
        ("smtp_username", "SMTP_USERNAME"),
        ("smtp_password", "SMTP_PASSWORD"),
        ("smtp_from_email", "SMTP_FROM_EMAIL"),
    ],
)
def test_production_startup_rejects_missing_smtp_settings(
    monkeypatch,
    setting_name: str,
    expected_message: str,
):
    _assert_startup_fails(
        monkeypatch,
        _settings_without(setting_name),
        expected_message,
    )


def test_development_startup_still_accepts_local_defaults(monkeypatch):
    settings = Settings(_env_file=None, environment="development")
    init_calls: list[bool] = []
    monkeypatch.setattr(main_module, "settings", settings)
    monkeypatch.setattr(main_module, "init_db", lambda: init_calls.append(True))

    with TestClient(main_module.app) as client:
        assert client.get("/api/health").status_code == 200

    assert init_calls == [True]


def test_valid_production_configuration_starts_successfully(monkeypatch):
    init_calls: list[bool] = []
    settings = _settings_from_environment(monkeypatch)
    assert {"auth_secret", "cors_origins"} <= settings.model_fields_set
    monkeypatch.setattr(main_module, "settings", settings)
    monkeypatch.setattr(main_module, "init_db", lambda: init_calls.append(True))

    with TestClient(main_module.app) as client:
        assert client.get("/api/health").status_code == 200

    assert init_calls == [True]
