"""Issue and verify rate-limited, single-use email OTP challenges."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import secrets

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.email_otp import EmailOtpChallenge
from app.models.user import User
from app.services.auth.email_delivery import OtpPurpose


def _utcnow() -> datetime:
    # SQLite persists naive values; all values in this table are UTC.
    return datetime.now(UTC).replace(tzinfo=None)


class EmailOtpService:
    def __init__(self, db: Session) -> None:
        self._db = db
        self._settings = get_settings()

    def _hash(self, email: str, purpose: OtpPurpose, code: str) -> str:
        payload = f"{email.casefold()}:{purpose}:{code}".encode("utf-8")
        return hmac.new(
            self._settings.auth_secret.get_secret_value().encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()

    def issue(self, user: User, purpose: OtpPurpose) -> str | None:
        """Create a code, or silently suppress a request inside the cooldown."""

        now = _utcnow()
        latest = self._db.scalar(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == user.email,
                EmailOtpChallenge.purpose == purpose,
            )
            .order_by(EmailOtpChallenge.id.desc())
        )
        if (
            latest is not None
            and latest.consumed_at is None
            and latest.created_at > now - timedelta(seconds=self._settings.email_otp_resend_seconds)
        ):
            return None

        self._db.execute(
            update(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == user.email,
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
        code = f"{secrets.randbelow(1_000_000):06d}"
        self._db.add(
            EmailOtpChallenge(
                user_id=user.id,
                email=user.email,
                purpose=purpose,
                code_hash=self._hash(user.email, purpose, code),
                expires_at=now + timedelta(minutes=self._settings.email_otp_expiry_minutes),
            )
        )
        self._db.commit()
        return code

    def verify(self, user: User | None, purpose: OtpPurpose, code: str) -> bool:
        now = _utcnow()
        if user is None or not user.is_active:
            # Keep the expensive comparison path present for unknown accounts.
            hmac.compare_digest(self._hash("unknown@example.invalid", purpose, code), "0" * 64)
            return False

        challenge = self._db.scalar(
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.user_id == user.id,
                EmailOtpChallenge.email == user.email,
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.consumed_at.is_(None),
            )
            .order_by(EmailOtpChallenge.id.desc())
        )
        if challenge is None:
            return False
        if (
            challenge.expires_at <= now
            or challenge.failed_attempts >= self._settings.email_otp_max_attempts
        ):
            challenge.consumed_at = now
            self._db.commit()
            return False

        if not hmac.compare_digest(
            challenge.code_hash,
            self._hash(user.email, purpose, code),
        ):
            challenge.failed_attempts += 1
            if challenge.failed_attempts >= self._settings.email_otp_max_attempts:
                challenge.consumed_at = now
            self._db.commit()
            return False

        challenge.consumed_at = now
        self._db.commit()
        return True

    def consume_all(self, email: str) -> None:
        self._db.execute(
            update(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == email.casefold(),
                EmailOtpChallenge.consumed_at.is_(None),
            )
            .values(consumed_at=_utcnow())
        )

    def consume_purpose(self, email: str, purpose: OtpPurpose) -> None:
        self._db.execute(
            update(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.email == email.casefold(),
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.consumed_at.is_(None),
            )
            .values(consumed_at=_utcnow())
        )
        self._db.commit()
