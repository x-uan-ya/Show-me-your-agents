"""Reusable authenticated-user, workspace and client RBAC dependencies."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.client import Client
from app.models.user import ClientMembership, User
from app.models.workspace import Workspace, WorkspaceMembership
from app.repositories.user_repository import UserRepository
from app.services.auth.tokens import InvalidSessionToken, read_session_token

WorkspaceRole = Literal["admin", "strategist", "reviewer", "viewer"]
Permission = Literal["read", "write", "review", "manage"]

_PERMISSION_ROLES: dict[Permission, set[str]] = {
    "read": {"admin", "strategist", "reviewer", "viewer"},
    "write": {"admin", "strategist"},
    "review": {"admin", "reviewer"},
    "manage": {"admin"},
}


@dataclass(frozen=True)
class AccessContext:
    user: User
    workspace: Workspace
    workspace_role: str

    @property
    def workspace_id(self) -> int:
        return self.workspace.id


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    token = request.cookies.get(get_settings().auth_cookie_name)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    try:
        user_id, session_version = read_session_token(token)
    except InvalidSessionToken as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc
    user = db.get(User, user_id)
    if (
        user is None
        or not user.is_active
        or not user.email_verified
        or user.session_version != session_version
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")
    return user


def access_context_for_workspace(
    db: Session,
    user: User,
    workspace_id: int | None = None,
) -> AccessContext:
    repo = UserRepository(db)
    membership = (
        repo.workspace_membership(user.id, workspace_id)
        if workspace_id is not None
        else next(iter(repo.workspace_memberships(user.id)), None)
    )
    if membership is None or membership.workspace is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "No active workspace membership",
        )
    return AccessContext(
        user=user,
        workspace=membership.workspace,
        workspace_role=membership.role,
    )


def get_current_access(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AccessContext:
    requested_workspace: int | None = None
    raw_workspace = request.headers.get("X-Workspace-ID")
    if raw_workspace:
        try:
            requested_workspace = int(raw_workspace)
        except ValueError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, "Invalid workspace header"
            ) from exc
        if requested_workspace <= 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid workspace header")
    return access_context_for_workspace(db, current_user, requested_workspace)


def _client_membership(
    db: Session,
    access: AccessContext,
    client_id: int,
) -> ClientMembership | None:
    stmt = select(ClientMembership).where(
        ClientMembership.user_id == access.user.id,
        ClientMembership.client_id == client_id,
        ClientMembership.is_active.is_(True),
    )
    return db.scalar(stmt)


def client_access_role(
    db: Session,
    access: AccessContext,
    client_id: int,
) -> str | None:
    client = db.get(Client, client_id)
    if client is None or client.workspace_id != access.workspace_id:
        return None
    if access.workspace_role == "admin":
        return "admin"
    membership = _client_membership(db, access, client_id)
    return membership.role if membership is not None else None


def user_can_access_client(
    db: Session,
    access: AccessContext,
    client_id: int,
    permission: Permission = "read",
) -> bool:
    role = client_access_role(db, access, client_id)
    return role in _PERMISSION_ROLES[permission]


def _require_client_permission(permission: Permission):
    def dependency(
        client_id: int,
        access: AccessContext = Depends(get_current_access),
        db: Session = Depends(get_db),
    ) -> Client:
        client = db.get(Client, client_id)
        # Deliberately use the same 404 for missing and inaccessible records so
        # a caller cannot enumerate another workspace's client IDs.
        if (
            client is None
            or client.workspace_id != access.workspace_id
            or not user_can_access_client(db, access, client_id, permission)
        ):
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Client not found")
        return client

    dependency.__name__ = f"require_client_{permission}"
    return dependency


require_client_access = _require_client_permission("read")
require_client_write = _require_client_permission("write")
require_client_review = _require_client_permission("review")
require_client_admin = _require_client_permission("manage")


def require_workspace_admin(
    access: AccessContext = Depends(get_current_access),
) -> AccessContext:
    if access.workspace_role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace admin access required")
    return access


def accessible_client_ids(db: Session, access: AccessContext) -> set[int]:
    """Return client IDs in the active workspace that the user may read."""

    if access.workspace_role == "admin":
        stmt = select(Client.id).where(Client.workspace_id == access.workspace_id)
        return set(db.scalars(stmt).all())
    stmt = (
        select(ClientMembership.client_id)
        .join(Client, Client.id == ClientMembership.client_id)
        .where(
            ClientMembership.user_id == access.user.id,
            ClientMembership.is_active.is_(True),
            Client.workspace_id == access.workspace_id,
        )
    )
    return set(db.scalars(stmt).all())
