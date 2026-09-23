"""Opaque registration-attempt tokens bound to pending users by HMAC."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from app.config import get_settings


def _hash_registration_token(token: str) -> str:
    return hmac.new(
        get_settings().auth_secret.get_secret_value().encode("utf-8"),
        f"registration:{token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def create_registration_token() -> tuple[str, str]:
    """Return a browser token and the HMAC digest that may be persisted."""

    token = secrets.token_urlsafe(32)
    return token, _hash_registration_token(token)


def registration_token_matches(expected_hash: str | None, token: str) -> bool:
    candidate = _hash_registration_token(token)
    return bool(expected_hash) and hmac.compare_digest(expected_hash, candidate)
