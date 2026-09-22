"""SMTP delivery stays backend-only and uses the configured secure transport."""

from app.config import get_settings
from app.services.auth.email_delivery import send_test_email


def test_smtp_test_message_uses_tls_and_authentication(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_delivery", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.test")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "sender@example.test")
    monkeypatch.setattr(settings, "smtp_password", settings.auth_secret)
    monkeypatch.setattr(settings, "smtp_from_email", "sender@example.test")
    monkeypatch.setattr(settings, "smtp_use_tls", True)
    monkeypatch.setattr(settings, "smtp_use_ssl", False)
    events: list[object] = []

    class FakeSmtp:
        def __init__(self, host, port, timeout):
            events.append(("connect", host, port, timeout))

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def starttls(self, context):
            events.append(("starttls", context is not None))

        def login(self, username, password):
            events.append(("login", username, bool(password)))

        def send_message(self, message):
            events.append(("send", message["To"], message["Subject"]))

    monkeypatch.setattr("app.services.auth.email_delivery.smtplib.SMTP", FakeSmtp)
    send_test_email("recipient@example.test")

    assert events[0][:3] == ("connect", "smtp.example.test", 587)
    assert ("starttls", True) in events
    assert ("login", "sender@example.test", True) in events
    assert (
        "send",
        "recipient@example.test",
        "Campaign Intelligence SMTP test",
    ) in events
