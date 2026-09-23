"""Deterministic abuse-protection tests; no real email or LLM calls occur."""

from collections.abc import Sequence

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import Base, get_db
from app.main import app
from app.models.client import Client
from app.models.customer_signal import CustomerSignal
from app.models.dataset import Dataset
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMembership
from app.services.ai.base import SignalInput
from app.services.ai.factory import get_ai_provider
from app.services.ai.mock_provider import MockAIProvider
from app.services.auth.dependencies import get_current_access, get_current_user
from app.services.auth.passwords import hash_password
from app.services.rate_limit import (
    InMemoryRateLimiter,
    RateLimitExceeded,
    RateLimitRule,
    client_ip,
)


PASSWORD = "RateLimitPassword!2026"


class CountingProvider(MockAIProvider):
    def __init__(self) -> None:
        super().__init__()
        self.calls = 0

    def analyze_signals(self, signals: Sequence[SignalInput]):
        self.calls += 1
        return super().analyze_signals(signals)


@pytest.fixture
def rate_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = testing_session()
        try:
            yield db
        finally:
            db.close()

    db = testing_session()
    workspace_a = Workspace(name="Rate Workspace A")
    workspace_b = Workspace(name="Rate Workspace B")
    db.add_all([workspace_a, workspace_b])
    db.flush()
    client_a = Client(name="Rate Client A", workspace_id=workspace_a.id)
    client_b = Client(name="Rate Client B", workspace_id=workspace_b.id)
    db.add_all([client_a, client_b])
    db.flush()
    dataset_a = Dataset(
        client_id=client_a.id,
        name="Rate dataset A",
        source_type="csv",
        status="ready",
    )
    dataset_b = Dataset(
        client_id=client_b.id,
        name="Rate dataset B",
        source_type="csv",
        status="ready",
    )
    db.add_all([dataset_a, dataset_b])
    db.flush()
    db.add_all([
        CustomerSignal(
            client_id=client_a.id,
            dataset_id=dataset_a.id,
            text="Customers value the quick setup and clear price.",
        ),
        CustomerSignal(
            client_id=client_b.id,
            dataset_id=dataset_b.id,
            text="Customers value reliable support and onboarding.",
        ),
    ])
    primary = User(
        email="rate-primary@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Rate Primary",
        role="admin",
        is_active=True,
        email_verified=True,
    )
    shared = User(
        email="rate-shared@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Rate Shared",
        role="admin",
        is_active=True,
        email_verified=True,
    )
    other = User(
        email="rate-other@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Rate Other",
        role="admin",
        is_active=True,
        email_verified=True,
    )
    db.add_all([primary, shared, other])
    db.flush()
    db.add_all([
        WorkspaceMembership(
            user_id=primary.id,
            workspace_id=workspace_a.id,
            role="admin",
            is_active=True,
        ),
        WorkspaceMembership(
            user_id=primary.id,
            workspace_id=workspace_b.id,
            role="admin",
            is_active=True,
        ),
        WorkspaceMembership(
            user_id=shared.id,
            workspace_id=workspace_a.id,
            role="admin",
            is_active=True,
        ),
        WorkspaceMembership(
            user_id=other.id,
            workspace_id=workspace_b.id,
            role="admin",
            is_active=True,
        ),
    ])
    db.commit()
    ids = {
        "workspace_a": workspace_a.id,
        "workspace_b": workspace_b.id,
        "client_a": client_a.id,
        "client_b": client_b.id,
        "dataset_a": dataset_a.id,
        "dataset_b": dataset_b.id,
    }
    db.close()

    provider = CountingProvider()
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_ai_provider] = lambda: provider
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_access, None)
    with TestClient(app) as client:
        yield client, testing_session, provider, ids
    app.dependency_overrides.clear()


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _analyse(
    client: TestClient,
    client_id: int,
    dataset_id: int,
    workspace_id: int | None = None,
):
    headers = {"X-Workspace-ID": str(workspace_id)} if workspace_id else None
    return client.post(
        f"/api/clients/{client_id}/analyse",
        json={"dataset_id": dataset_id},
        headers=headers,
    )


def test_login_ip_limit_returns_429_before_extra_scrypt(rate_env, monkeypatch):
    client, _, _, _ = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "login_ip_limit", 2)
    monkeypatch.setattr(settings, "login_account_limit", 20)
    from app.routers import auth as auth_router

    original_verify = auth_router.verify_password
    calls = 0

    def counted_verify(password: str, password_hash: str) -> bool:
        nonlocal calls
        calls += 1
        return original_verify(password, password_hash)

    monkeypatch.setattr(auth_router, "verify_password", counted_verify)
    for _ in range(2):
        assert _login(client, "rate-primary@example.test", "WrongPassword!2026").status_code == 401
    blocked = _login(client, "rate-primary@example.test", "WrongPassword!2026")
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many requests. Please try again later."}
    assert blocked.headers["retry-after"] == "60"
    assert calls == 2


def test_login_account_limit_normalizes_email_and_success_resets_failures(
    rate_env, monkeypatch
):
    client, _, _, _ = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "login_ip_limit", 50)
    monkeypatch.setattr(settings, "login_account_limit", 2)

    assert _login(client, " RATE-PRIMARY@EXAMPLE.TEST ", "WrongPassword!2026").status_code == 401
    assert _login(client, "rate-primary@example.test").status_code == 200
    assert _login(client, "rate-primary@example.test", "WrongPassword!2026").status_code == 401
    assert _login(client, "RATE-PRIMARY@example.test", "WrongPassword!2026").status_code == 401
    assert _login(client, "rate-primary@example.test", "WrongPassword!2026").status_code == 429


def test_registration_limit_blocks_before_user_creation(rate_env, monkeypatch):
    client, session_factory, _, _ = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "register_ip_limit", 2)
    monkeypatch.setattr(settings, "register_email_limit", 20)
    monkeypatch.setattr(settings, "otp_ip_limit", 20)
    monkeypatch.setattr(settings, "otp_email_limit", 20)
    monkeypatch.setattr("app.routers.auth.send_otp_email", lambda *_args: None)

    for index in range(2):
        response = client.post(
            "/api/auth/register",
            json={
                "email": f"new-{index}@example.test",
                "password": PASSWORD,
                "display_name": f"New User {index}",
            },
        )
        assert response.status_code == 201
    blocked = client.post(
        "/api/auth/register",
        json={
            "email": "not-created@example.test",
            "password": PASSWORD,
            "display_name": "Not Created",
        },
    )
    assert blocked.status_code == 429
    with session_factory() as db:
        assert db.scalar(
            select(User).where(User.email == "not-created@example.test")
        ) is None


def test_otp_request_has_email_and_ip_limits(rate_env, monkeypatch):
    client, _, _, _ = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "otp_email_limit", 1)
    monkeypatch.setattr(settings, "otp_ip_limit", 20)
    monkeypatch.setattr("app.routers.auth.send_otp_email", lambda *_args: None)

    assert client.post(
        "/api/auth/email-login/request",
        json={"email": "rate-primary@example.test"},
    ).status_code == 202
    assert client.post(
        "/api/auth/email-login/request",
        json={"email": "RATE-PRIMARY@example.test"},
    ).status_code == 429


def test_otp_ip_limit_blocks_rotating_unknown_emails(rate_env, monkeypatch):
    client, _, _, _ = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "otp_email_limit", 20)
    monkeypatch.setattr(settings, "otp_ip_limit", 2)

    for index in range(2):
        assert client.post(
            "/api/auth/password-reset/request",
            json={"email": f"unknown-{index}@example.test"},
        ).status_code == 202
    assert client.post(
        "/api/auth/password-reset/request",
        json={"email": "unknown-2@example.test"},
    ).status_code == 429


def test_otp_verification_works_below_limit(rate_env, monkeypatch):
    client, _, _, _ = rate_env
    delivered: list[str] = []
    monkeypatch.setattr(
        "app.routers.auth.send_otp_email",
        lambda _email, code, _purpose: delivered.append(code),
    )
    assert client.post(
        "/api/auth/email-login/request",
        json={"email": "rate-primary@example.test"},
    ).status_code == 202
    verified = client.post(
        "/api/auth/email-login/verify",
        json={"email": "rate-primary@example.test", "code": delivered[0]},
    )
    assert verified.status_code == 200


def test_ai_user_limit_blocks_before_provider_call(rate_env, monkeypatch):
    client, _, provider, ids = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_user_limit", 2)
    monkeypatch.setattr(settings, "ai_workspace_limit", 20)
    assert _login(client, "rate-primary@example.test").status_code == 200

    for _ in range(2):
        assert _analyse(client, ids["client_a"], ids["dataset_a"]).status_code == 200
    blocked = _analyse(client, ids["client_a"], ids["dataset_a"])
    assert blocked.status_code == 429
    assert provider.calls == 2


def test_ai_workspace_limit_is_shared_by_multiple_users(rate_env, monkeypatch):
    client, _, provider, ids = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_user_limit", 20)
    monkeypatch.setattr(settings, "ai_workspace_limit", 2)

    assert _login(client, "rate-primary@example.test").status_code == 200
    assert _analyse(client, ids["client_a"], ids["dataset_a"]).status_code == 200
    assert _login(client, "rate-shared@example.test").status_code == 200
    assert _analyse(client, ids["client_a"], ids["dataset_a"]).status_code == 200
    assert _analyse(client, ids["client_a"], ids["dataset_a"]).status_code == 429
    assert provider.calls == 2


def test_ai_workspace_limit_does_not_cross_workspaces(rate_env, monkeypatch):
    client, _, provider, ids = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_user_limit", 20)
    monkeypatch.setattr(settings, "ai_workspace_limit", 1)

    assert _login(client, "rate-shared@example.test").status_code == 200
    assert _analyse(client, ids["client_a"], ids["dataset_a"]).status_code == 200
    assert _login(client, "rate-other@example.test").status_code == 200
    assert _analyse(client, ids["client_b"], ids["dataset_b"]).status_code == 200
    assert provider.calls == 2


def test_workspace_header_cannot_bypass_user_quota_or_membership(rate_env, monkeypatch):
    client, _, provider, ids = rate_env
    settings = get_settings()
    monkeypatch.setattr(settings, "ai_user_limit", 1)
    monkeypatch.setattr(settings, "ai_workspace_limit", 20)
    assert _login(client, "rate-primary@example.test").status_code == 200

    assert _analyse(
        client,
        ids["client_a"],
        ids["dataset_a"],
        ids["workspace_a"],
    ).status_code == 200
    unauthorized = _analyse(client, ids["client_b"], ids["dataset_b"], 999_999)
    assert unauthorized.status_code == 403
    switched = _analyse(
        client,
        ids["client_b"],
        ids["dataset_b"],
        ids["workspace_b"],
    )
    assert switched.status_code == 429
    assert provider.calls == 1


def test_retry_after_expires_with_injected_clock():
    now = [100.0]
    limiter = InMemoryRateLimiter(clock=lambda: now[0])
    rule = RateLimitRule("test", limit=1, window_seconds=10)
    limiter.consume_many([("identity", rule)])
    with pytest.raises(RateLimitExceeded) as caught:
        limiter.consume_many([("identity", rule)])
    assert caught.value.retry_after == 10
    now[0] = 111.0
    limiter.consume_many([("identity", rule)])


def test_spoofed_forwarded_header_is_ignored_without_trusted_proxy():
    request = Request({
        "type": "http",
        "client": ("203.0.113.7", 443),
        "headers": [(b"x-forwarded-for", b"198.51.100.99")],
    })
    settings = Settings(
        _env_file=None,
        rate_limit_trusted_proxy_cidrs="",
    )
    assert client_ip(request, settings) == "203.0.113.7"
