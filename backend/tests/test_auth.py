"""Authentication, cookie session, roles and direct client-access tests."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.client import Client
from app.models.email_otp import EmailOtpChallenge
from app.models.user import ClientMembership, User
from app.models.workspace import Workspace, WorkspaceMembership
from app.services.auth.dependencies import get_current_access, get_current_user
from app.services.auth.passwords import hash_password, verify_password

PASSWORD = "LocalTestPassword!2026"


@pytest.fixture
def auth_env():
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

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_access, None)

    db = testing_session()
    workspace_a = Workspace(name="Agency A")
    workspace_b = Workspace(name="Agency B")
    db.add_all([workspace_a, workspace_b])
    db.flush()
    client_a = Client(name="Authorised Client", workspace_id=workspace_a.id)
    client_a2 = Client(name="Second Agency A Client", workspace_id=workspace_a.id)
    client_b = Client(name="Other Agency Client", workspace_id=workspace_b.id)
    db.add_all([client_a, client_a2, client_b])
    db.flush()
    admin = User(
        email="admin@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Admin User",
        role="admin",
        is_active=True,
    )
    strategist = User(
        email="strategist@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Strategy User",
        role="strategist",
        is_active=True,
    )
    reviewer = User(
        email="reviewer@example.test",
        password_hash=hash_password(PASSWORD),
        display_name="Review User",
        role="reviewer",
        is_active=True,
    )
    db.add_all([admin, strategist, reviewer])
    db.flush()
    db.add_all([
        WorkspaceMembership(
            user_id=admin.id, workspace_id=workspace_a.id, role="admin", is_active=True
        ),
        WorkspaceMembership(
            user_id=strategist.id,
            workspace_id=workspace_a.id,
            role="strategist",
            is_active=True,
        ),
        WorkspaceMembership(
            user_id=reviewer.id,
            workspace_id=workspace_a.id,
            role="reviewer",
            is_active=True,
        ),
        ClientMembership(
            user_id=strategist.id,
            client_id=client_a.id,
            role="strategist",
            is_active=True,
        ),
        ClientMembership(
            user_id=reviewer.id,
            client_id=client_a.id,
            role="reviewer",
            is_active=True,
        ),
    ])
    db.commit()
    ids = {
        "a": client_a.id,
        "a2": client_a2.id,
        "b": client_b.id,
        "workspace_a": workspace_a.id,
        "workspace_b": workspace_b.id,
        "session_factory": testing_session,
    }
    db.close()

    with TestClient(app) as test_client:
        yield test_client, ids
    app.dependency_overrides.clear()


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def _capture_otp(monkeypatch) -> list[tuple[str, str, str]]:
    delivered: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "app.routers.auth.send_otp_email",
        lambda email, code, purpose: delivered.append((email, code, purpose)),
    )
    return delivered


def _register(
    client: TestClient,
    email: str = "new.user@example.test",
    password: str = "RegistrationPassword!2026",
    display_name: str = "New User",
):
    return client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": password,
            "display_name": display_name,
        },
    )


def _verify_registration(client: TestClient, registration: dict, code: str):
    return client.post(
        "/api/auth/verify-registration-email",
        json={
            "email": registration["email"],
            "code": code,
            "verification_token": registration["verification_token"],
        },
    )


def test_valid_login_sets_session_and_returns_safe_user(auth_env):
    client, _ = auth_env
    response = _login(client, "strategist@example.test")
    assert response.status_code == 200
    assert response.json()["role"] == "strategist"
    assert response.json()["workspace_name"] == "Agency A"
    assert "password_hash" not in response.json()
    assert "HttpOnly" in response.headers["set-cookie"]
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "strategist@example.test"
    assert "password_hash" not in me.json()


def test_registration_stays_untrusted_until_email_is_verified(auth_env, monkeypatch):
    client, ids = auth_env
    delivered = _capture_otp(monkeypatch)
    session_factory = ids["session_factory"]

    response = _register(client)
    assert response.status_code == 201
    registration = response.json()
    assert registration["verification_required"] is True
    assert registration["email"] == "new.user@example.test"
    assert len(registration["verification_token"]) >= 32
    assert "password_hash" not in registration
    assert delivered[0][1] not in str(registration)
    assert "set-cookie" not in response.headers
    assert delivered[0][0] == registration["email"]
    assert delivered[0][2] == "registration"

    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == registration["email"]))
        assert user is not None
        assert user.is_active is True
        assert user.email_verified is False
        assert user.role == "viewer"
        assert user.pending_workspace_name == "New User's Workspace"
        assert user.registration_token_hash != registration["verification_token"]
        assert verify_password("RegistrationPassword!2026", user.password_hash)
        assert db.scalar(
            select(func.count()).select_from(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user.id
            )
        ) == 0

    blocked = _login(client, registration["email"], "RegistrationPassword!2026")
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "Email verification is required before sign in"
    assert client.get("/api/auth/me").status_code == 401

    verified = _verify_registration(client, registration, delivered[0][1])
    assert verified.status_code == 200
    assert verified.json()["message"] == "Email verified. Sign in to continue."
    assert "set-cookie" not in verified.headers

    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == registration["email"]))
        assert user is not None
        assert user.email_verified is True
        assert user.role == "admin"
        assert user.pending_workspace_name is None
        assert user.registration_token_hash is None
        challenge = db.scalar(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.user_id == user.id,
                EmailOtpChallenge.purpose == "registration",
            )
            .order_by(EmailOtpChallenge.id.desc())
        )
        assert challenge is not None
        assert challenge.code_hash != delivered[0][1]
        assert len(challenge.code_hash) == 64
        assert challenge.consumed_at is not None
        membership = db.scalar(
            select(WorkspaceMembership).where(WorkspaceMembership.user_id == user.id)
        )
        assert membership is not None
        assert membership.role == "admin"
        assert membership.workspace.name == "New User's Workspace"

    # Registration verification is single-use and never signs the user in implicitly.
    assert _verify_registration(client, registration, delivered[0][1]).status_code == 400
    logged_in = _login(client, registration["email"], "RegistrationPassword!2026")
    assert logged_in.status_code == 200
    assert logged_in.json()["role"] == "admin"
    assert logged_in.json()["workspace_name"] == "New User's Workspace"


def test_duplicate_registration_is_rejected(auth_env):
    client, _ = auth_env
    response = client.post(
        "/api/auth/register",
        json={
            "email": "strategist@example.test",
            "password": "RegistrationPassword!2026",
            "display_name": "Duplicate User",
        },
    )
    assert response.status_code == 409


def test_incorrect_or_expired_registration_otp_does_not_activate_account(
    auth_env, monkeypatch
):
    client, ids = auth_env
    delivered = _capture_otp(monkeypatch)
    registration = _register(client, email="expires@example.test").json()
    wrong_code = "000000" if delivered[0][1] != "000000" else "999999"

    assert _verify_registration(client, registration, wrong_code).status_code == 400
    assert client.post(
        "/api/auth/verify-registration-email",
        json={
            "email": registration["email"],
            "code": delivered[0][1],
            "verification_token": "x" * 43,
        },
    ).status_code == 400

    session_factory = ids["session_factory"]
    with session_factory() as db:
        challenge = db.scalar(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == registration["email"],
                EmailOtpChallenge.purpose == "registration",
            )
            .order_by(EmailOtpChallenge.id.desc())
        )
        assert challenge is not None
        challenge.expires_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(seconds=1)
        db.commit()

    assert _verify_registration(client, registration, delivered[0][1]).status_code == 400
    with session_factory() as db:
        user = db.scalar(select(User).where(User.email == registration["email"]))
        assert user is not None and user.email_verified is False
        assert db.scalar(
            select(func.count()).select_from(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user.id
            )
        ) == 0


def test_registration_otp_locks_after_five_failed_attempts(auth_env, monkeypatch):
    client, _ = auth_env
    delivered = _capture_otp(monkeypatch)
    registration = _register(client, email="attempts@example.test").json()
    wrong_code = "000000" if delivered[0][1] != "000000" else "999999"

    for _ in range(5):
        assert _verify_registration(client, registration, wrong_code).status_code == 400
    assert _verify_registration(client, registration, delivered[0][1]).status_code == 400
    assert _login(
        client, registration["email"], "RegistrationPassword!2026"
    ).status_code == 403
    retried = _register(client, email=registration["email"])
    assert retried.status_code == 201
    # Retrying registration cannot immediately reset the per-email OTP limit.
    assert len(delivered) == 1
    assert retried.json()["verification_token"] != registration["verification_token"]


def test_unverified_registration_cannot_bypass_verification_with_other_auth_flows(
    auth_env, monkeypatch
):
    client, _ = auth_env
    delivered = _capture_otp(monkeypatch)
    registration = _register(client, email="no-bypass@example.test").json()
    registration_code = delivered[0][1]

    login_request = client.post(
        "/api/auth/email-login/request",
        json={"email": registration["email"]},
    )
    reset_request = client.post(
        "/api/auth/password-reset/request",
        json={"email": registration["email"]},
    )
    assert login_request.status_code == reset_request.status_code == 202
    assert login_request.json() == reset_request.json()
    assert len(delivered) == 1
    assert client.post(
        "/api/auth/email-login/verify",
        json={"email": registration["email"], "code": registration_code},
    ).status_code == 401
    assert client.post(
        "/api/auth/password-reset/confirm",
        json={
            "email": registration["email"],
            "code": registration_code,
            "new_password": "BypassAttempt!2026",
        },
    ).status_code == 400


def test_registration_resend_obeys_cooldown_and_replaces_old_code(auth_env, monkeypatch):
    client, ids = auth_env
    delivered = _capture_otp(monkeypatch)
    registration = _register(client, email="resend@example.test").json()
    first_code = delivered[0][1]

    immediate = client.post(
        "/api/auth/resend-registration-otp",
        json={
            "email": registration["email"],
            "verification_token": registration["verification_token"],
        },
    )
    assert immediate.status_code == 202
    assert len(delivered) == 1

    session_factory = ids["session_factory"]
    with session_factory() as db:
        challenge = db.scalar(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == registration["email"],
                EmailOtpChallenge.purpose == "registration",
            )
            .order_by(EmailOtpChallenge.id.desc())
        )
        assert challenge is not None
        challenge.created_at = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=2)
        db.commit()

    resent = client.post(
        "/api/auth/resend-registration-otp",
        json={
            "email": registration["email"],
            "verification_token": registration["verification_token"],
        },
    )
    assert resent.status_code == 202
    assert resent.json()["resend_after_seconds"] == 60
    assert len(delivered) == 2
    assert _verify_registration(client, registration, first_code).status_code == 400
    assert _verify_registration(client, registration, delivered[1][1]).status_code == 200


def test_duplicate_pending_registration_reuses_user_and_requires_latest_token(
    auth_env, monkeypatch
):
    client, ids = auth_env
    delivered = _capture_otp(monkeypatch)
    first = _register(
        client,
        email="Pending.User@Example.Test",
        password="FirstRegistration!2026",
        display_name="First Name",
    ).json()
    second_response = _register(
        client,
        email="pending.user@example.test",
        password="SecondRegistration!2026",
        display_name="Second Name",
    )
    assert second_response.status_code == 201
    second = second_response.json()
    assert second["email"] == "pending.user@example.test"
    assert second["verification_token"] != first["verification_token"]
    # The existing OTP remains within its cooldown, but only the newest opaque
    # browser token can complete the replaced pending registration.
    assert len(delivered) == 1
    assert _verify_registration(client, first, delivered[0][1]).status_code == 400

    session_factory = ids["session_factory"]
    with session_factory() as db:
        assert db.scalar(
            select(func.count()).select_from(User).where(
                User.email == "pending.user@example.test"
            )
        ) == 1
        user = db.scalar(select(User).where(User.email == "pending.user@example.test"))
        assert user is not None
        assert user.display_name == "Second Name"
        assert verify_password("SecondRegistration!2026", user.password_hash)

    assert _verify_registration(client, second, delivered[0][1]).status_code == 200
    assert _login(client, second["email"], "FirstRegistration!2026").status_code == 401
    assert _login(client, second["email"], "SecondRegistration!2026").status_code == 200


def test_invalid_password_is_rejected(auth_env):
    client, _ = auth_env
    response = _login(client, "strategist@example.test", "WrongPassword!2026")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_email_otp_sign_in_is_generic_single_use_and_sets_session(auth_env, monkeypatch):
    client, _ = auth_env
    delivered: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "app.routers.auth.send_otp_email",
        lambda email, code, purpose: delivered.append((email, code, purpose)),
    )

    unknown = client.post(
        "/api/auth/email-login/request",
        json={"email": "missing@example.test"},
    )
    requested = client.post(
        "/api/auth/email-login/request",
        json={"email": "admin@example.test"},
    )
    assert unknown.status_code == requested.status_code == 202
    assert unknown.json() == requested.json()
    assert len(delivered) == 1
    email, code, purpose = delivered[0]
    assert email == "admin@example.test"
    assert purpose == "login"
    assert len(code) == 6 and code.isdigit()
    assert client.post(
        "/api/auth/email-login/request",
        json={"email": "admin@example.test"},
    ).status_code == 202
    assert len(delivered) == 1

    verified = client.post(
        "/api/auth/email-login/verify",
        json={"email": email, "code": code},
    )
    assert verified.status_code == 200
    assert verified.json()["role"] == "admin"
    assert client.get("/api/auth/me").status_code == 200
    assert client.post(
        "/api/auth/email-login/verify",
        json={"email": email, "code": code},
    ).status_code == 401


def test_email_otp_locks_after_five_failed_attempts(auth_env, monkeypatch):
    client, _ = auth_env
    delivered: list[str] = []
    monkeypatch.setattr(
        "app.routers.auth.send_otp_email",
        lambda _email, code, _purpose: delivered.append(code),
    )
    client.post(
        "/api/auth/email-login/request",
        json={"email": "reviewer@example.test"},
    )
    wrong_code = "000000" if delivered[0] != "000000" else "999999"
    for _ in range(5):
        assert client.post(
            "/api/auth/email-login/verify",
            json={"email": "reviewer@example.test", "code": wrong_code},
        ).status_code == 401
    assert client.post(
        "/api/auth/email-login/verify",
        json={"email": "reviewer@example.test", "code": delivered[0]},
    ).status_code == 401


def test_password_reset_otp_changes_password_and_revokes_old_session(auth_env, monkeypatch):
    client, _ = auth_env
    delivered: list[str] = []
    monkeypatch.setattr(
        "app.routers.auth.send_otp_email",
        lambda _email, code, _purpose: delivered.append(code),
    )
    assert _login(client, "admin@example.test").status_code == 200
    assert client.post(
        "/api/auth/password-reset/request",
        json={"email": "admin@example.test"},
    ).status_code == 202

    new_password = "ChangedPassword!2026"
    reset = client.post(
        "/api/auth/password-reset/confirm",
        json={
            "email": "admin@example.test",
            "code": delivered[0],
            "new_password": new_password,
        },
    )
    assert reset.status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert _login(client, "admin@example.test", PASSWORD).status_code == 401
    assert _login(client, "admin@example.test", new_password).status_code == 200


def test_unauthenticated_protected_request_returns_401(auth_env):
    client, _ = auth_env
    assert client.get("/api/clients").status_code == 401


def test_assigned_user_can_access_only_assigned_client(auth_env):
    client, ids = auth_env
    assert _login(client, "strategist@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}").status_code == 404
    assert client.get(f"/api/clients/{ids['a']}/workflow-status").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}/workflow-status").status_code == 404
    assert client.get(f"/api/clients/{ids['a']}/analyses/latest").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}/analyses/latest").status_code == 404
    listed = client.get("/api/clients")
    assert [item["id"] for item in listed.json()] == [ids["a"]]


def test_reviewer_uses_same_membership_boundary(auth_env):
    client, ids = auth_env
    assert _login(client, "reviewer@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}/datasets").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}/datasets").status_code == 404


def test_admin_is_limited_to_the_active_workspace(auth_env):
    client, ids = auth_env
    assert _login(client, "admin@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}").status_code == 200
    assert client.get(f"/api/clients/{ids['a2']}").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}").status_code == 404
    assert len(client.get("/api/clients").json()) == 2


def test_reviewer_cannot_create_or_delete_clients(auth_env):
    client, ids = auth_env
    assert _login(client, "reviewer@example.test").status_code == 200
    assert client.post("/api/clients", json={"name": "Forbidden"}).status_code == 403
    assert client.delete(f"/api/clients/{ids['a']}").status_code == 404
    assert client.put(
        f"/api/clients/{ids['a']}/marketing-brief",
        json={"objective": "Forbidden write"},
    ).status_code == 404


def test_strategist_can_create_client_but_cannot_delete_it(auth_env):
    client, ids = auth_env
    assert _login(client, "strategist@example.test").status_code == 200
    created = client.post("/api/clients", json={"name": "Strategy Client"})
    assert created.status_code == 201
    assert created.json()["workspace_id"] == ids["workspace_a"]
    assert client.delete(f"/api/clients/{created.json()['id']}").status_code == 404
    assert client.patch(
        f"/api/clients/{ids['a']}/campaigns/999/status",
        json={"status": "approved"},
    ).status_code == 404


def test_admin_cannot_add_unverified_user_then_can_add_after_verification(
    auth_env, monkeypatch
):
    client, ids = auth_env
    delivered = _capture_otp(monkeypatch)
    registration_response = _register(client, email="invited@example.test")
    assert registration_response.status_code == 201
    registration = registration_response.json()

    assert _login(client, "admin@example.test").status_code == 200
    self_update = client.post(
        "/api/workspaces/current/members",
        json={"email": "admin@example.test", "role": "viewer"},
    )
    assert self_update.status_code == 422
    unverified_member = client.post(
        "/api/workspaces/current/members",
        json={"email": "invited@example.test", "role": "reviewer"},
    )
    assert unverified_member.status_code == 422
    assert unverified_member.json()["detail"] == (
        "User must verify their email before workspace access can be granted"
    )

    session_factory = ids["session_factory"]
    with session_factory() as db:
        pending_invited = db.scalar(
            select(User).where(User.email == "invited@example.test")
        )
        assert pending_invited is not None
        invited_id = pending_invited.id
    unverified_client_assignment = client.put(
        f"/api/workspaces/current/clients/{ids['a']}/members/{invited_id}",
        json={"role": "reviewer"},
    )
    assert unverified_client_assignment.status_code == 422
    assert unverified_client_assignment.json()["detail"] == (
        "Verified active user required before client assignment"
    )

    assert _verify_registration(client, registration, delivered[0][1]).status_code == 200
    with session_factory() as db:
        invited = db.scalar(select(User).where(User.email == "invited@example.test"))
        assert invited is not None
        invited_id = invited.id
        own_membership = db.scalar(
            select(WorkspaceMembership).where(WorkspaceMembership.user_id == invited.id)
        )
        assert own_membership is not None
        invited_workspace_id = own_membership.workspace_id

    member = client.post(
        "/api/workspaces/current/members",
        json={"email": "invited@example.test", "role": "reviewer"},
    )
    assert member.status_code == 200
    assignment = client.put(
        f"/api/workspaces/current/clients/{ids['a']}/members/{invited_id}",
        json={"role": "reviewer"},
    )
    assert assignment.status_code == 200

    assert _login(
        client, "invited@example.test", "RegistrationPassword!2026"
    ).status_code == 200
    own_workspace = client.post(
        "/api/auth/workspace", json={"workspace_id": invited_workspace_id}
    )
    assert own_workspace.status_code == 200
    assert client.get(
        "/api/clients", headers={"X-Workspace-ID": str(invited_workspace_id)}
    ).json() == []
    switched = client.post(
        "/api/auth/workspace", json={"workspace_id": ids["workspace_a"]}
    )
    assert switched.status_code == 200
    assert switched.json()["role"] == "reviewer"
    headers = {"X-Workspace-ID": str(ids["workspace_a"])}
    assert [item["id"] for item in client.get("/api/clients", headers=headers).json()] == [
        ids["a"]
    ]

    assert _login(client, "admin@example.test").status_code == 200
    assert client.delete(f"/api/workspaces/current/members/{invited_id}").status_code == 204
    assert _login(
        client, "invited@example.test", "RegistrationPassword!2026"
    ).status_code == 200
    assert client.get("/api/clients", headers=headers).status_code == 403


def test_logout_clears_cookie_and_subsequent_request_is_unauthenticated(auth_env):
    client, _ = auth_env
    assert _login(client, "admin@example.test").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/clients").status_code == 401
