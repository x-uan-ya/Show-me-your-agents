"""Trusted creator-admin provisioning tests."""

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMembership
from app.scripts.grant_creator_admin import grant_creator_admin


def _session() -> Session:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    return Session(engine)


def test_verified_internal_creator_can_be_granted_admin_idempotently():
    with _session() as db:
        workspace = Workspace(name="Maker Workspace")
        creator = User(
            email="creator@example.test",
            password_hash="hash",
            display_name="Creator",
            role="viewer",
            is_active=True,
            email_verified=True,
        )
        db.add_all([workspace, creator])
        db.commit()
        initial_session_version = creator.session_version

        membership = grant_creator_admin(db, " Creator@Example.Test ", workspace.id)
        assert membership.role == "admin"
        assert membership.is_active is True
        assert creator.role == "admin"
        assert creator.session_version == initial_session_version + 1

        grant_creator_admin(db, creator.email, workspace.id)
        assert creator.session_version == initial_session_version + 1
        assert len(db.scalars(select(WorkspaceMembership)).all()) == 1


def test_unverified_account_cannot_be_granted_creator_admin():
    with _session() as db:
        workspace = Workspace(name="Maker Workspace")
        user = User(
            email="pending@example.test",
            password_hash="hash",
            display_name="Pending",
            role="viewer",
            is_active=True,
            email_verified=False,
        )
        db.add_all([workspace, user])
        db.commit()

        with pytest.raises(ValueError, match="active and email-verified"):
            grant_creator_admin(db, user.email, workspace.id)
