"""Small HS256 JWT implementation for the local HttpOnly-cookie session."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import time

from app.config import get_settings


class InvalidSessionToken(ValueError):
    pass


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def create_session_token(user_id: int, session_version: int = 1) -> str:
    settings = get_settings()
    now = int(time.time())
    header = _encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    payload = _encode(
        json.dumps(
            {
                "sub": str(user_id),
                "ver": session_version,
                "iat": now,
                "exp": now + settings.auth_session_seconds,
            },
            separators=(",", ":"),
        ).encode()
    )
    unsigned = f"{header}.{payload}".encode("ascii")
    signature = hmac.new(
        settings.auth_secret.get_secret_value().encode("utf-8"),
        unsigned,
        hashlib.sha256,
    ).digest()
    return f"{header}.{payload}.{_encode(signature)}"


def read_session_token(token: str) -> tuple[int, int]:
    settings = get_settings()
    try:
        header, payload, signature = token.split(".", 2)
        unsigned = f"{header}.{payload}".encode("ascii")
        expected = hmac.new(
            settings.auth_secret.get_secret_value().encode("utf-8"),
            unsigned,
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(expected, _decode(signature)):
            raise InvalidSessionToken("Invalid signature")
        header_data = json.loads(_decode(header))
        data = json.loads(_decode(payload))
        if header_data.get("alg") != "HS256" or header_data.get("typ") != "JWT":
            raise InvalidSessionToken("Unsupported token")
        if int(data["exp"]) <= int(time.time()):
            raise InvalidSessionToken("Expired token")
        user_id = int(data["sub"])
        session_version = int(data.get("ver", 1))
        if user_id <= 0 or session_version <= 0:
            raise InvalidSessionToken("Invalid subject")
        return user_id, session_version
    except (
        KeyError,
        ValueError,
        TypeError,
        binascii.Error,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as exc:
        if isinstance(exc, InvalidSessionToken):
            raise
        raise InvalidSessionToken("Malformed token") from exc
