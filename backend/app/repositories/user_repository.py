"""Persistence helpers for users and client memberships."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import ClientMembership, User
from app.services.auth.passwords import hash_password


class UserRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def by_email(self, email: str) -> User | None:
        return self._db.scalar(select(User).where(User.email == email.strip().casefold()))

    def create_strategist(self, email: str, password: str, display_name: str) -> User:
        user = User(
            email=email.strip().casefold(),
            password_hash=hash_password(password),
            display_name=" ".join(display_name.split()),
            role="strategist",
            is_active=True,
        )
        self._db.add(user)
        self._db.commit()
        self._db.refresh(user)
        return user

    def add_membership(self, user_id: int, client_id: int) -> ClientMembership:
        existing = self._db.scalar(
            select(ClientMembership).where(
                ClientMembership.user_id == user_id,
                ClientMembership.client_id == client_id,
            )
        )
        if existing is not None:
            return existing
        membership = ClientMembership(user_id=user_id, client_id=client_id)
        self._db.add(membership)
        self._db.commit()
        self._db.refresh(membership)
        return membership
