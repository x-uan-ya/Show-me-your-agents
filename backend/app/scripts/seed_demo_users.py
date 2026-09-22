"""Create local hackathon users without placing passwords in source code.

Run from ``backend``::

    .venv/bin/python -m app.scripts.seed_demo_users

The password is read from DEMO_USER_PASSWORD or requested without echo. Existing
users are left unchanged. Strategist and reviewer are assigned to the first
existing client, when one is available; admin can access every client.
"""

from __future__ import annotations

import getpass
import os

from sqlalchemy import select

from app.database import SessionLocal, init_db
from app.models.client import Client
from app.models.user import ClientMembership, User
from app.services.auth.passwords import hash_password

DEMO_USERS = (
    ("admin@showmeyouragents.local", "Demo Admin", "admin"),
    ("strategist@showmeyouragents.local", "Demo Strategist", "strategist"),
    ("reviewer@showmeyouragents.local", "Demo Reviewer", "reviewer"),
)


def _password() -> str:
    value = os.getenv("DEMO_USER_PASSWORD") or getpass.getpass(
        "Demo password (8-128 characters): "
    )
    if not 8 <= len(value) <= 128:
        raise SystemExit("Demo password must contain between 8 and 128 characters.")
    return value


def main() -> None:
    init_db()
    password_hash = hash_password(_password())
    db = SessionLocal()
    try:
        created: list[User] = []
        for email, display_name, role in DEMO_USERS:
            user = db.scalar(select(User).where(User.email == email))
            if user is None:
                user = User(
                    email=email,
                    password_hash=password_hash,
                    display_name=display_name,
                    role=role,
                    is_active=True,
                )
                db.add(user)
                db.flush()
                created.append(user)

        first_client = db.scalar(select(Client).order_by(Client.id))
        if first_client is not None:
            for email in (DEMO_USERS[1][0], DEMO_USERS[2][0]):
                user = db.scalar(select(User).where(User.email == email))
                assert user is not None
                membership = db.scalar(
                    select(ClientMembership).where(
                        ClientMembership.user_id == user.id,
                        ClientMembership.client_id == first_client.id,
                    )
                )
                if membership is None:
                    db.add(ClientMembership(user_id=user.id, client_id=first_client.id))
        db.commit()
        action = "Created" if created else "Demo users already existed"
        print(f"{action}. Login emails:")
        for email, _, role in DEMO_USERS:
            print(f"  {role}: {email}")
        if first_client is None:
            print("No client existed; strategist/reviewer have no assignment yet.")
        else:
            print(f"Strategist/reviewer assigned to client #{first_client.id}: {first_client.name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
