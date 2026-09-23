"""Small process-local sliding-window limiter and central abuse policies.

The current Lightsail deployment uses one backend container, so a thread-safe
in-memory store is sufficient for the hackathon. A future multi-instance
deployment must replace ``InMemoryRateLimiter`` with a shared atomic store.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import hashlib
import hmac
from ipaddress import ip_address, ip_network
import logging
import math
from threading import RLock
import time
from typing import Callable, Iterable

from fastapi import HTTPException, Request, status

from app.config import Settings, get_settings
from app.services.auth.dependencies import AccessContext


logger = logging.getLogger(__name__)
RATE_LIMIT_DETAIL = "Too many requests. Please try again later."


@dataclass(frozen=True)
class RateLimitRule:
    name: str
    limit: int
    window_seconds: int


@dataclass
class _Bucket:
    events: deque[float]
    window_seconds: int


class RateLimitExceeded(RuntimeError):
    def __init__(self, rule: RateLimitRule, retry_after: int) -> None:
        super().__init__(rule.name)
        self.rule = rule
        self.retry_after = retry_after


class InMemoryRateLimiter:
    """Thread-safe sliding-window counters with deterministic test hooks."""

    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._default_clock = clock
        self._clock = clock
        self._buckets: dict[str, _Bucket] = {}
        self._logged_until: dict[str, float] = {}
        self._operations = 0
        self._lock = RLock()

    @staticmethod
    def _key(identity: str, rule: RateLimitRule) -> str:
        return f"{rule.name}:{identity}"

    @staticmethod
    def _purge(bucket: _Bucket, now: float) -> None:
        cutoff = now - bucket.window_seconds
        while bucket.events and bucket.events[0] <= cutoff:
            bucket.events.popleft()

    def _bucket(self, key: str, rule: RateLimitRule, now: float) -> _Bucket:
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(deque(), rule.window_seconds)
            self._buckets[key] = bucket
        else:
            bucket.window_seconds = rule.window_seconds
        self._purge(bucket, now)
        return bucket

    def _sweep(self, now: float) -> None:
        self._operations += 1
        if self._operations % 256:
            return
        stale: list[str] = []
        for key, bucket in self._buckets.items():
            self._purge(bucket, now)
            if not bucket.events:
                stale.append(key)
        for key in stale:
            self._buckets.pop(key, None)
            self._logged_until.pop(key, None)

    def _exceeded(
        self,
        key: str,
        rule: RateLimitRule,
        bucket: _Bucket,
        now: float,
    ) -> RateLimitExceeded:
        retry_after = max(
            1,
            math.ceil(bucket.events[0] + rule.window_seconds - now),
        )
        if self._logged_until.get(key, 0) <= now:
            logger.warning(
                "Rate limit triggered category=%s identity=%s",
                rule.name,
                key.rsplit(":", 1)[-1][:12],
            )
            self._logged_until[key] = now + retry_after
        return RateLimitExceeded(rule, retry_after)

    def check_many(self, entries: Iterable[tuple[str, RateLimitRule]]) -> None:
        with self._lock:
            now = self._clock()
            self._sweep(now)
            for identity, rule in entries:
                key = self._key(identity, rule)
                bucket = self._bucket(key, rule, now)
                if len(bucket.events) >= rule.limit:
                    raise self._exceeded(key, rule, bucket, now)

    def consume_many(self, entries: Iterable[tuple[str, RateLimitRule]]) -> None:
        values = list(entries)
        with self._lock:
            now = self._clock()
            self._sweep(now)
            prepared: list[_Bucket] = []
            for identity, rule in values:
                key = self._key(identity, rule)
                bucket = self._bucket(key, rule, now)
                if len(bucket.events) >= rule.limit:
                    raise self._exceeded(key, rule, bucket, now)
                prepared.append(bucket)
            for bucket in prepared:
                bucket.events.append(now)

    def clear(self, identity: str, rule: RateLimitRule) -> None:
        with self._lock:
            key = self._key(identity, rule)
            self._buckets.pop(key, None)
            self._logged_until.pop(key, None)

    def reset(self, clock: Callable[[], float] | None = None) -> None:
        with self._lock:
            self._buckets.clear()
            self._logged_until.clear()
            self._operations = 0
            self._clock = clock or self._default_clock


rate_limiter = InMemoryRateLimiter()


def _rule(name: str, limit: int, window_seconds: int) -> RateLimitRule:
    return RateLimitRule(name=name, limit=limit, window_seconds=window_seconds)


def _private_identity(kind: str, value: str, settings: Settings) -> str:
    digest = hmac.new(
        settings.auth_secret.get_secret_value().encode("utf-8"),
        f"rate-limit:{kind}:{value}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return digest


def client_ip(request: Request, settings: Settings | None = None) -> str:
    """Resolve IP without trusting a caller-supplied forwarding header.

    Forwarded values are considered only when the direct socket peer belongs to
    an explicitly configured trusted proxy network. The chain is walked from
    right to left, skipping trusted proxy hops.
    """

    settings = settings or get_settings()
    direct = request.client.host if request.client is not None else "unknown"
    try:
        direct_address = ip_address(direct)
    except ValueError:
        return direct

    networks = [
        ip_network(entry, strict=False)
        for entry in settings.rate_limit_trusted_proxy_cidrs.split(",")
        if entry
    ]
    if not networks or not any(direct_address in network for network in networks):
        return direct_address.compressed

    forwarded = request.headers.get("x-forwarded-for", "")
    candidates = [part.strip() for part in forwarded.split(",") if part.strip()]
    for candidate in reversed(candidates):
        try:
            address = ip_address(candidate)
        except ValueError:
            continue
        if any(address in network for network in networks):
            continue
        return address.compressed
    return direct_address.compressed


def _raise_http(exc: RateLimitExceeded) -> None:
    raise HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail=RATE_LIMIT_DETAIL,
        headers={"Retry-After": str(exc.retry_after)},
    ) from exc


def _consume(entries: Iterable[tuple[str, RateLimitRule]], settings: Settings) -> None:
    if not settings.rate_limit_enabled:
        return
    try:
        rate_limiter.consume_many(entries)
    except RateLimitExceeded as exc:
        _raise_http(exc)


def _check(entries: Iterable[tuple[str, RateLimitRule]], settings: Settings) -> None:
    if not settings.rate_limit_enabled:
        return
    try:
        rate_limiter.check_many(entries)
    except RateLimitExceeded as exc:
        _raise_http(exc)


def _login_account_entry(email: str, settings: Settings) -> tuple[str, RateLimitRule]:
    return (
        _private_identity("email", email.strip().casefold(), settings),
        _rule(
            "login_account",
            settings.login_account_limit,
            settings.login_account_window_seconds,
        ),
    )


def enforce_login_before_password(request: Request, email: str) -> None:
    settings = get_settings()
    ip_identity = _private_identity("ip", client_ip(request, settings), settings)
    _consume(
        [
            (
                ip_identity,
                _rule(
                    "login_ip",
                    settings.login_ip_limit,
                    settings.login_ip_window_seconds,
                ),
            )
        ],
        settings,
    )
    _check([_login_account_entry(email, settings)], settings)


def record_login_failure(email: str) -> None:
    settings = get_settings()
    _consume([_login_account_entry(email, settings)], settings)


def clear_login_failures(email: str) -> None:
    settings = get_settings()
    if not settings.rate_limit_enabled:
        return
    identity, rule = _login_account_entry(email, settings)
    rate_limiter.clear(identity, rule)


def enforce_registration(request: Request, email: str) -> None:
    settings = get_settings()
    ip_identity = _private_identity("ip", client_ip(request, settings), settings)
    email_identity = _private_identity("email", email.strip().casefold(), settings)
    _consume(
        [
            (
                ip_identity,
                _rule(
                    "register_ip",
                    settings.register_ip_limit,
                    settings.register_ip_window_seconds,
                ),
            ),
            (
                email_identity,
                _rule(
                    "register_email",
                    settings.register_email_limit,
                    settings.register_email_window_seconds,
                ),
            ),
            (
                ip_identity,
                _rule("otp_ip", settings.otp_ip_limit, settings.otp_ip_window_seconds),
            ),
            (
                email_identity,
                _rule(
                    "otp_email",
                    settings.otp_email_limit,
                    settings.otp_email_window_seconds,
                ),
            ),
        ],
        settings,
    )


def enforce_otp_request(request: Request, email: str) -> None:
    settings = get_settings()
    _consume(
        [
            (
                _private_identity("ip", client_ip(request, settings), settings),
                _rule("otp_ip", settings.otp_ip_limit, settings.otp_ip_window_seconds),
            ),
            (
                _private_identity("email", email.strip().casefold(), settings),
                _rule(
                    "otp_email",
                    settings.otp_email_limit,
                    settings.otp_email_window_seconds,
                ),
            ),
        ],
        settings,
    )


def enforce_otp_verification(request: Request, email: str) -> None:
    settings = get_settings()
    _consume(
        [
            (
                _private_identity("ip", client_ip(request, settings), settings),
                _rule(
                    "otp_verify_ip",
                    settings.otp_verify_ip_limit,
                    settings.otp_verify_window_seconds,
                ),
            ),
            (
                _private_identity("email", email.strip().casefold(), settings),
                _rule(
                    "otp_verify_email",
                    settings.otp_verify_email_limit,
                    settings.otp_verify_window_seconds,
                ),
            ),
        ],
        settings,
    )


def enforce_ai_action(request: Request, access: AccessContext) -> None:
    settings = get_settings()
    _consume(
        [
            (
                str(access.user.id),
                _rule(
                    "ai_user",
                    settings.ai_user_limit,
                    settings.ai_rate_limit_window_seconds,
                ),
            ),
            (
                str(access.workspace_id),
                _rule(
                    "ai_workspace",
                    settings.ai_workspace_limit,
                    settings.ai_rate_limit_window_seconds,
                ),
            ),
        ],
        settings,
    )
