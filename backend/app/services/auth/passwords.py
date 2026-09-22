"""Password hashing based on the standard-library scrypt KDF."""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import os

_N = 2**14
_R = 8
_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 64


def _encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def hash_password(password: str) -> str:
    """Return a salted scrypt hash; the plaintext is never persisted."""
    if not 8 <= len(password) <= 128:
        raise ValueError("Password must contain between 8 and 128 characters")
    salt = os.urandom(_SALT_BYTES)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_KEY_BYTES
    )
    return f"scrypt${_N}${_R}${_P}${_encode(salt)}${_encode(digest)}"


def verify_password(password: str, encoded: str) -> bool:
    """Verify a password while treating malformed stored hashes as invalid."""
    try:
        algorithm, n, r, p, salt, expected = encoded.split("$", 5)
        if algorithm != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=_decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(_decode(expected)),
        )
        return hmac.compare_digest(digest, _decode(expected))
    except (ValueError, TypeError, binascii.Error):
        return False
