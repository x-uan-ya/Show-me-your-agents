"""Workspace membership and per-client access administration."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.client import Client
from app.models.user import ClientMembership, User
from app.models.workspace import WorkspaceMembership
from app.repositories.user_repository import UserRepository
from app.schemas.workspace import (
    ClientMemberRead,
    ClientMemberWrite,
    WorkspaceMemberAdd,
    WorkspaceMemberRead,
    WorkspaceRead,
)
from app.services.auth.dependencies import (
    AccessContext,
    get_current_access,
    require_client_admin,
    require_workspace_admin,
)

router = APIRouter(prefix="/workspaces/current", tags=["workspace access"])


@router.get("", response_model=WorkspaceRead)
def current_workspace(
    access: AccessContext = Depends(get_current_access),
) -> WorkspaceRead:
    return WorkspaceRead(
        id=access.workspace_id,
        name=access.workspace.name,
        role=access.workspace_role,
    )


@router.get("/members", response_model=list[WorkspaceMemberRead])
def list_workspace_members(
    access: AccessContext = Depends(require_workspace_admin),
    db: Session = Depends(get_db),
) -> list[WorkspaceMemberRead]:
    stmt = (
        select(WorkspaceMembership, User)
        .join(User, User.id == WorkspaceMembership.user_id)
        .where(
            WorkspaceMembership.workspace_id == access.workspace_id,
            WorkspaceMembership.is_active.is_(True),
        )
        .order_by(User.display_name, User.id)
    )
    return [
        WorkspaceMemberRead(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=membership.role,
            is_active=user.is_active and membership.is_active,
            created_at=membership.created_at,
        )
        for membership, user in db.execute(stmt).all()
    ]


@router.post("/members", response_model=WorkspaceMemberRead)
def add_workspace_member(
    payload: WorkspaceMemberAdd,
    access: AccessContext = Depends(require_workspace_admin),
    db: Session = Depends(get_db),
) -> WorkspaceMemberRead:
    repo = UserRepository(db)
    user = repo.by_email(payload.email)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Active user not found")
    if not user.email_verified:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "User must verify their email before workspace access can be granted",
        )
    if user.id == access.user.id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Use another workspace admin to change your own membership",
        )
    membership = repo.add_workspace_membership(
        user.id, access.workspace_id, payload.role
    )
    return WorkspaceMemberRead(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=membership.role,
        is_active=membership.is_active,
        created_at=membership.created_at,
    )


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_workspace_member(
    user_id: int,
    access: AccessContext = Depends(require_workspace_admin),
    db: Session = Depends(get_db),
) -> None:
    if user_id == access.user.id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "You cannot remove your own active workspace membership",
        )
    UserRepository(db).remove_workspace_membership(user_id, access.workspace_id)


@router.get(
    "/clients/{client_id}/members",
    response_model=list[ClientMemberRead],
)
def list_client_members(
    client_id: int,
    _: Client = Depends(require_client_admin),
    db: Session = Depends(get_db),
) -> list[ClientMemberRead]:
    stmt = (
        select(ClientMembership)
        .where(
            ClientMembership.client_id == client_id,
            ClientMembership.is_active.is_(True),
        )
        .order_by(ClientMembership.user_id)
    )
    return [
        ClientMemberRead(
            user_id=membership.user_id,
            client_id=membership.client_id,
            role=membership.role,
            is_active=membership.is_active,
        )
        for membership in db.scalars(stmt).all()
    ]


@router.put(
    "/clients/{client_id}/members/{user_id}",
    response_model=ClientMemberRead,
)
def assign_client_member(
    client_id: int,
    user_id: int,
    payload: ClientMemberWrite,
    _: Client = Depends(require_client_admin),
    access: AccessContext = Depends(require_workspace_admin),
    db: Session = Depends(get_db),
) -> ClientMemberRead:
    repo = UserRepository(db)
    user = db.get(User, user_id)
    if user is None or not user.is_active or not user.email_verified:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Verified active user required before client assignment",
        )
    if repo.workspace_membership(user_id, access.workspace_id) is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "User must belong to this workspace before client assignment",
        )
    membership = repo.add_membership(user_id, client_id, payload.role)
    return ClientMemberRead(
        user_id=membership.user_id,
        client_id=membership.client_id,
        role=membership.role,
        is_active=membership.is_active,
    )


@router.delete(
    "/clients/{client_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_client_member(
    client_id: int,
    user_id: int,
    _: Client = Depends(require_client_admin),
    db: Session = Depends(get_db),
) -> None:
    UserRepository(db).remove_client_membership(user_id, client_id)
