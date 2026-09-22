"""Reusable authenticated-user and client-access FastAPI dependencies."""

from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.client import Client
from app.models.user import ClientMembership, User
from app.services.auth.tokens import InvalidSessionToken, read_session_token


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(get_settings().auth_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        user_id = read_session_token(token)
    except InvalidSessionToken as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return user


def user_can_access_client(db: Session, user: User, client_id: int) -> bool:
    if user.role == "admin":
        return db.get(Client, client_id) is not None
    stmt = select(ClientMembership.id).where(
        ClientMembership.user_id == user.id,
        ClientMembership.client_id == client_id,
    )
    return db.scalar(stmt) is not None


def require_client_access(
    client_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Client:
    client = db.get(Client, client_id)
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Client {client_id} not found")
    if not user_can_access_client(db, current_user, client_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this client")
    return client


def accessible_client_ids(db: Session, user: User) -> set[int] | None:
    """Return None for admin (all clients), otherwise the assigned client ids."""
    if user.role == "admin":
        return None
    stmt = select(ClientMembership.client_id).where(ClientMembership.user_id == user.id)
    return set(db.scalars(stmt).all())
