"""Persistence helpers for users, workspaces and client memberships."""

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.client import Client
from app.models.user import ClientMembership, User
from app.models.workspace import Workspace, WorkspaceMembership
from app.services.auth.passwords import hash_password


class UserRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def by_email(self, email: str) -> User | None:
        return self._db.scalar(select(User).where(User.email == email.strip().casefold()))

    def create_workspace_owner(
        self,
        email: str,
        password: str,
        display_name: str,
        workspace_name: str | None = None,
    ) -> tuple[User, WorkspaceMembership]:
        """Register a user into a brand-new tenant, never the legacy tenant."""

        cleaned_name = " ".join(display_name.split())
        user = User(
            email=email.strip().casefold(),
            password_hash=hash_password(password),
            display_name=cleaned_name,
            # Kept for compatibility with older databases. Authorisation uses
            # WorkspaceMembership and ClientMembership roles below.
            role="admin",
            is_active=True,
        )
        self._db.add(user)
        self._db.flush()
        workspace = Workspace(
            name=(workspace_name or f"{cleaned_name}'s Workspace").strip()
        )
        self._db.add(workspace)
        self._db.flush()
        membership = WorkspaceMembership(
            user_id=user.id,
            workspace_id=workspace.id,
            role="admin",
            is_active=True,
        )
        self._db.add(membership)
        self._db.commit()
        self._db.refresh(user)
        self._db.refresh(membership)
        return user, membership

    def workspace_memberships(self, user_id: int) -> list[WorkspaceMembership]:
        stmt = (
            select(WorkspaceMembership)
            .options(joinedload(WorkspaceMembership.workspace))
            .where(
                WorkspaceMembership.user_id == user_id,
                WorkspaceMembership.is_active.is_(True),
            )
            .order_by(WorkspaceMembership.workspace_id)
        )
        return list(self._db.scalars(stmt).unique().all())

    def workspace_membership(
        self, user_id: int, workspace_id: int
    ) -> WorkspaceMembership | None:
        stmt = (
            select(WorkspaceMembership)
            .options(joinedload(WorkspaceMembership.workspace))
            .where(
                WorkspaceMembership.user_id == user_id,
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.is_active.is_(True),
            )
        )
        return self._db.scalar(stmt)

    def add_workspace_membership(
        self, user_id: int, workspace_id: int, role: str
    ) -> WorkspaceMembership:
        membership = self._db.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user_id,
                WorkspaceMembership.workspace_id == workspace_id,
            )
        )
        if membership is None:
            membership = WorkspaceMembership(
                user_id=user_id,
                workspace_id=workspace_id,
                role=role,
                is_active=True,
            )
            self._db.add(membership)
        else:
            membership.role = role
            membership.is_active = True
        self._db.commit()
        self._db.refresh(membership)
        return membership

    def remove_workspace_membership(self, user_id: int, workspace_id: int) -> bool:
        membership = self._db.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.user_id == user_id,
                WorkspaceMembership.workspace_id == workspace_id,
                WorkspaceMembership.is_active.is_(True),
            )
        )
        if membership is None:
            return False
        membership.is_active = False
        client_memberships = self._db.scalars(
            select(ClientMembership)
            .join(ClientMembership.client)
            .where(
                ClientMembership.user_id == user_id,
                Client.workspace_id == workspace_id,
            )
        ).all()
        for client_membership in client_memberships:
            client_membership.is_active = False
        self._db.commit()
        return True

    def add_membership(
        self, user_id: int, client_id: int, role: str = "strategist"
    ) -> ClientMembership:
        existing = self._db.scalar(
            select(ClientMembership).where(
                ClientMembership.user_id == user_id,
                ClientMembership.client_id == client_id,
            )
        )
        if existing is not None:
            existing.role = role
            existing.is_active = True
            self._db.commit()
            self._db.refresh(existing)
            return existing
        membership = ClientMembership(
            user_id=user_id,
            client_id=client_id,
            role=role,
            is_active=True,
        )
        self._db.add(membership)
        self._db.commit()
        self._db.refresh(membership)
        return membership

    def remove_client_membership(self, user_id: int, client_id: int) -> bool:
        membership = self._db.scalar(
            select(ClientMembership).where(
                ClientMembership.user_id == user_id,
                ClientMembership.client_id == client_id,
            )
        )
        if membership is None:
            return False
        membership.is_active = False
        self._db.commit()
        return True
