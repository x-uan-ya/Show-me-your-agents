"""Authentication, cookie session, roles and direct client-access tests."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models.client import Client
from app.models.user import ClientMembership, User
from app.services.auth.dependencies import get_current_user
from app.services.auth.passwords import hash_password

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

    db = testing_session()
    client_a = Client(name="Authorised Client")
    client_b = Client(name="Restricted Client")
    db.add_all([client_a, client_b])
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
        ClientMembership(user_id=strategist.id, client_id=client_a.id),
        ClientMembership(user_id=reviewer.id, client_id=client_a.id),
    ])
    db.commit()
    ids = {"a": client_a.id, "b": client_b.id}
    db.close()

    with TestClient(app) as test_client:
        yield test_client, ids
    app.dependency_overrides.clear()


def _login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def test_valid_login_sets_session_and_returns_safe_user(auth_env):
    client, _ = auth_env
    response = _login(client, "strategist@example.test")
    assert response.status_code == 200
    assert response.json()["role"] == "strategist"
    assert "password_hash" not in response.json()
    assert "HttpOnly" in response.headers["set-cookie"]
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "strategist@example.test"
    assert "password_hash" not in me.json()


def test_email_registration_creates_hashed_strategist_then_allows_login(auth_env):
    client, _ = auth_env
    response = client.post(
        "/api/auth/register",
        json={
            "email": "new.user@example.test",
            "password": "RegistrationPassword!2026",
            "display_name": "New User",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "strategist"
    assert "password_hash" not in response.json()
    assert _login(
        client, "new.user@example.test", "RegistrationPassword!2026"
    ).status_code == 200


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


def test_invalid_password_is_rejected(auth_env):
    client, _ = auth_env
    response = _login(client, "strategist@example.test", "WrongPassword!2026")
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_unauthenticated_protected_request_returns_401(auth_env):
    client, _ = auth_env
    assert client.get("/api/clients").status_code == 401


def test_assigned_user_can_access_only_assigned_client(auth_env):
    client, ids = auth_env
    assert _login(client, "strategist@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}").status_code == 403
    listed = client.get("/api/clients")
    assert [item["id"] for item in listed.json()] == [ids["a"]]


def test_reviewer_uses_same_membership_boundary(auth_env):
    client, ids = auth_env
    assert _login(client, "reviewer@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}/datasets").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}/datasets").status_code == 403


def test_admin_can_access_multiple_clients(auth_env):
    client, ids = auth_env
    assert _login(client, "admin@example.test").status_code == 200
    assert client.get(f"/api/clients/{ids['a']}").status_code == 200
    assert client.get(f"/api/clients/{ids['b']}").status_code == 200
    assert len(client.get("/api/clients").json()) == 2


def test_logout_clears_cookie_and_subsequent_request_is_unauthenticated(auth_env):
    client, _ = auth_env
    assert _login(client, "admin@example.test").status_code == 200
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/clients").status_code == 401
