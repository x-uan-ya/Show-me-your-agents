"""Grant creator-admin access through a trusted server-side command.

Public registration and Team Access can never grant the ``admin`` role. Run
this command from the backend environment only after an internal creator has
registered and verified their email::

    .venv/bin/python -m app.scripts.grant_creator_admin \
        creator@example.com --workspace-id 1
"""

from __future__ import annotations

import argparse

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMembership


def grant_creator_admin(db: Session, email: str, workspace_id: int) -> WorkspaceMembership:
    """Promote one verified internal creator in an explicitly selected workspace."""

    normalized_email = email.strip().casefold()
    user = db.scalar(select(User).where(User.email == normalized_email))
    if user is None:
        raise ValueError("No account exists for that email")
    if not user.is_active or not user.email_verified:
        raise ValueError("The creator account must be active and email-verified")
    workspace = db.get(Workspace, workspace_id)
    if workspace is None:
        raise ValueError("Workspace does not exist")

    membership = db.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.user_id == user.id,
            WorkspaceMembership.workspace_id == workspace_id,
        )
    )
    changed = user.role != "admin"
    user.role = "admin"
    if membership is None:
        membership = WorkspaceMembership(
            user_id=user.id,
            workspace_id=workspace_id,
            role="admin",
            is_active=True,
        )
        db.add(membership)
        changed = True
    else:
        changed = changed or membership.role != "admin" or not membership.is_active
        membership.role = "admin"
        membership.is_active = True

    if changed:
        # Invalidate any customer-scoped session after privilege elevation.
        user.session_version += 1
    db.commit()
    db.refresh(membership)
    return membership


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Grant creator-admin access to a verified internal account."
    )
    parser.add_argument("email", help="Verified internal creator email")
    parser.add_argument("--workspace-id", type=int, required=True, help="Target workspace ID")
    return parser.parse_args()


def main() -> None:
    args = _arguments()
    init_db()
    db = SessionLocal()
    try:
        membership = grant_creator_admin(db, args.email, args.workspace_id)
    except ValueError as exc:
        db.rollback()
        raise SystemExit(str(exc)) from exc
    finally:
        db.close()
    print(
        f"Creator admin granted: {args.email.strip().casefold()} "
        f"in workspace #{membership.workspace_id}"
    )


if __name__ == "__main__":
    main()
