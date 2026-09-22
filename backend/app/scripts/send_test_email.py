"""Send one test email using the SMTP settings in backend/.env."""

from __future__ import annotations

import argparse

from app.services.auth.email_delivery import EmailDeliveryError, send_test_email


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Send a test message using the configured SMTP account."
    )
    parser.add_argument("recipient", help="Inbox that should receive the test message")
    args = parser.parse_args()
    recipient = args.recipient.strip().casefold()
    if "@" not in recipient or recipient.startswith("@") or recipient.endswith("@"):
        raise SystemExit("Enter a valid recipient email address.")
    try:
        send_test_email(recipient)
    except EmailDeliveryError as exc:
        raise SystemExit(f"SMTP test failed: {exc}") from exc
    print(f"SMTP test sent successfully to {recipient}.")


if __name__ == "__main__":
    main()
