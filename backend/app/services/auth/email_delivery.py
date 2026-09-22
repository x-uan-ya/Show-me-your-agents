"""Deliver email OTPs through SMTP, with an explicit local console mode."""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Literal

from app.config import get_settings

OtpPurpose = Literal["login", "password_reset"]

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


def _deliver_smtp(message: EmailMessage) -> None:
    settings = get_settings()
    if not settings.smtp_host:
        raise EmailDeliveryError("SMTP_HOST is required when EMAIL_DELIVERY=smtp")

    smtp_class = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    try:
        with smtp_class(
            settings.smtp_host,
            settings.smtp_port,
            timeout=settings.smtp_timeout_seconds,
        ) as smtp:
            if settings.smtp_use_tls and not settings.smtp_use_ssl:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(
                    settings.smtp_username,
                    settings.smtp_password.get_secret_value()
                    if settings.smtp_password is not None
                    else "",
                )
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("Email delivery failed") from exc


def send_otp_email(recipient: str, code: str, purpose: OtpPurpose) -> None:
    settings = get_settings()
    action = "sign in" if purpose == "login" else "reset your password"
    subject = (
        "Your Campaign Intelligence sign-in code"
        if purpose == "login"
        else "Reset your Campaign Intelligence password"
    )

    if settings.email_delivery == "console":
        if settings.environment.lower() not in {"development", "dev", "test"}:
            raise EmailDeliveryError("Console OTP delivery is disabled outside development")
        logger.warning(
            "LOCAL EMAIL OTP for %s (%s): %s",
            recipient,
            purpose,
            code,
        )
        return

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = recipient
    message.set_content(
        f"Use {code} to {action}.\n\n"
        f"This code expires in {settings.email_otp_expiry_minutes} minutes and can only be used once.\n"
        "If you did not request this code, you can ignore this email."
    )
    _deliver_smtp(message)


def send_test_email(recipient: str) -> None:
    """Send a non-OTP message to validate the configured SMTP connection."""

    settings = get_settings()
    if settings.email_delivery != "smtp":
        raise EmailDeliveryError("Set EMAIL_DELIVERY=smtp before testing SMTP")
    message = EmailMessage()
    message["Subject"] = "Campaign Intelligence SMTP test"
    message["From"] = formataddr((settings.smtp_from_name, settings.smtp_from_email))
    message["To"] = recipient
    message.set_content(
        "Your Campaign Intelligence SMTP configuration is working.\n\n"
        "No action is required."
    )
    _deliver_smtp(message)
