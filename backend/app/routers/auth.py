"""Password and email-OTP authentication using an HttpOnly session cookie."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ActiveWorkspaceRequest,
    AuthMessage,
    CurrentUserRead,
    EmailOtpRequest,
    EmailOtpVerifyRequest,
    LoginRequest,
    PasswordResetConfirmRequest,
    RegistrationOtpStatus,
    RegistrationPendingRead,
    RegistrationResendRequest,
    RegistrationVerificationRequest,
    RegisterRequest,
    WorkspaceSummary,
)
from app.services.auth.dependencies import (
    AccessContext,
    access_context_for_workspace,
    get_current_access,
    get_current_user,
)
from app.services.auth.email_delivery import EmailDeliveryError, OtpPurpose, send_otp_email
from app.services.auth.email_otp import EmailOtpService
from app.services.auth.passwords import hash_password, verify_password
from app.services.auth.registration_tokens import (
    create_registration_token,
    registration_token_matches,
)
from app.services.auth.tokens import create_session_token
from app.services.rate_limit import (
    clear_login_failures,
    enforce_login_before_password,
    enforce_otp_request,
    enforce_otp_verification,
    enforce_registration,
    record_login_failure,
)

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

OTP_REQUEST_MESSAGE = (
    "If an active account exists for that email, a verification code has been sent."
)
REGISTRATION_MESSAGE = "Check your email for a verification code to finish registration."
REGISTRATION_RESEND_MESSAGE = (
    "If a pending registration matches those details, a verification code has been sent."
)


def _set_session_cookie(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=create_session_token(user.id, user.session_version),
        max_age=settings.auth_session_seconds,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )


def _request_email_otp(
    payload: EmailOtpRequest,
    purpose: OtpPurpose,
    db: Session,
) -> AuthMessage:
    user = UserRepository(db).by_email(payload.email)
    if user is None or not user.is_active or not user.email_verified:
        return AuthMessage(message=OTP_REQUEST_MESSAGE)
    service = EmailOtpService(db)
    code = service.issue(user, purpose)
    if code is not None:
        try:
            send_otp_email(user.email, code, purpose)
        except EmailDeliveryError:
            # Keep public responses identical for known and unknown emails.
            service.consume_purpose(user.email, purpose)
            logger.exception("Could not deliver a %s OTP", purpose)
    return AuthMessage(message=OTP_REQUEST_MESSAGE)


def _issue_registration_otp(user: User, db: Session) -> bool:
    """Issue/deliver one registration OTP, preserving cooldown and single use."""

    service = EmailOtpService(db)
    code = service.issue(user, "registration")
    if code is None:
        return True
    try:
        send_otp_email(user.email, code, "registration")
    except EmailDeliveryError:
        service.consume_purpose(user.email, "registration")
        logger.exception("Could not deliver a registration OTP")
        return False
    return True


def _registration_response(user: User, token: str) -> RegistrationPendingRead:
    settings = get_settings()
    return RegistrationPendingRead(
        verification_required=True,
        email=user.email,
        verification_token=token,
        resend_after_seconds=settings.email_otp_resend_seconds,
        message=REGISTRATION_MESSAGE,
    )


def _safe_user(db: Session, access: AccessContext) -> CurrentUserRead:
    memberships = UserRepository(db).workspace_memberships(access.user.id)
    return CurrentUserRead(
        id=access.user.id,
        email=access.user.email,
        display_name=access.user.display_name,
        role=access.workspace_role,
        is_active=access.user.is_active,
        created_at=access.user.created_at,
        workspace_id=access.workspace_id,
        workspace_name=access.workspace.name,
        workspaces=[
            WorkspaceSummary(
                id=membership.workspace_id,
                name=membership.workspace.name,
                role=membership.role,
            )
            for membership in memberships
        ],
    )


@router.post(
    "/register",
    response_model=RegistrationPendingRead,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RegistrationPendingRead:
    # Registration also sends an OTP, so both registration and email-send
    # policies are consumed before password hashing or database writes.
    enforce_registration(request, payload.email)
    repo = UserRepository(db)
    existing = repo.by_email(payload.email)
    if existing is not None and existing.email_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    token, token_hash = create_registration_token()
    try:
        if existing is None:
            user = repo.create_pending_workspace_owner(
                payload.email,
                payload.password,
                payload.display_name,
                token_hash,
                payload.workspace_name,
            )
        else:
            user = repo.replace_pending_workspace_owner(
                existing,
                payload.password,
                payload.display_name,
                token_hash,
                payload.workspace_name,
            )
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists"
        ) from exc
    if not _issue_registration_otp(user, db):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Could not deliver the verification code. Please try again.",
        )
    return _registration_response(user, token)


@router.post("/verify-registration-email", response_model=AuthMessage)
def verify_registration_email(
    payload: RegistrationVerificationRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthMessage:
    enforce_otp_verification(request, payload.email)
    repo = UserRepository(db)
    user = repo.by_email(payload.email)
    if (
        user is None
        or not user.is_active
        or user.email_verified
        or not registration_token_matches(
            user.registration_token_hash,
            payload.verification_token,
        )
        or not EmailOtpService(db).verify(user, "registration", payload.code)
    ):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid or expired verification code",
        )
    repo.verify_email_and_create_workspace(user)
    return AuthMessage(message="Email verified. Sign in to continue.")


@router.post(
    "/resend-registration-otp",
    response_model=RegistrationOtpStatus,
    status_code=status.HTTP_202_ACCEPTED,
)
def resend_registration_otp(
    payload: RegistrationResendRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> RegistrationOtpStatus:
    enforce_otp_request(request, payload.email)
    user = UserRepository(db).by_email(payload.email)
    if (
        user is not None
        and user.is_active
        and not user.email_verified
        and registration_token_matches(
            user.registration_token_hash,
            payload.verification_token,
        )
        and not _issue_registration_otp(user, db)
    ):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Could not deliver the verification code. Please try again.",
        )
    return RegistrationOtpStatus(
        message=REGISTRATION_RESEND_MESSAGE,
        resend_after_seconds=get_settings().email_otp_resend_seconds,
    )


@router.post("/login", response_model=CurrentUserRead)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> CurrentUserRead:
    # Reject exhausted IP/account buckets before invoking scrypt verification.
    enforce_login_before_password(request, payload.email)
    user = UserRepository(db).by_email(payload.email)
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        record_login_failure(payload.email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if not user.email_verified:
        record_login_failure(payload.email)
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Email verification is required before sign in",
        )

    access = access_context_for_workspace(db, user)

    clear_login_failures(payload.email)
    _set_session_cookie(response, user)
    return _safe_user(db, access)


@router.post(
    "/email-login/request",
    response_model=AuthMessage,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_email_login_code(
    payload: EmailOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthMessage:
    enforce_otp_request(request, payload.email)
    return _request_email_otp(payload, "login", db)


@router.post("/email-login/verify", response_model=CurrentUserRead)
def verify_email_login_code(
    payload: EmailOtpVerifyRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> CurrentUserRead:
    enforce_otp_verification(request, payload.email)
    user = UserRepository(db).by_email(payload.email)
    eligible_user = (
        user if user is not None and user.is_active and user.email_verified else None
    )
    if not EmailOtpService(db).verify(eligible_user, "login", payload.code):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid or expired verification code",
        )
    assert user is not None
    access = access_context_for_workspace(db, user)
    _set_session_cookie(response, user)
    return _safe_user(db, access)


@router.post(
    "/password-reset/request",
    response_model=AuthMessage,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_password_reset_code(
    payload: EmailOtpRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthMessage:
    enforce_otp_request(request, payload.email)
    return _request_email_otp(payload, "password_reset", db)


@router.post("/password-reset/confirm", response_model=AuthMessage)
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> AuthMessage:
    enforce_otp_verification(request, payload.email)
    user = UserRepository(db).by_email(payload.email)
    eligible_user = (
        user if user is not None and user.is_active and user.email_verified else None
    )
    service = EmailOtpService(db)
    if not service.verify(eligible_user, "password_reset", payload.code):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid or expired verification code",
        )
    assert eligible_user is not None
    user = eligible_user
    user.password_hash = hash_password(payload.new_password)
    user.session_version += 1
    service.consume_all(user.email)
    db.commit()
    return AuthMessage(message="Password reset successfully. Sign in with your new password.")


@router.get("/me", response_model=CurrentUserRead)
def current_user(
    access: AccessContext = Depends(get_current_access),
    db: Session = Depends(get_db),
) -> CurrentUserRead:
    return _safe_user(db, access)


@router.post("/workspace", response_model=CurrentUserRead)
def switch_workspace(
    payload: ActiveWorkspaceRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentUserRead:
    """Validate a workspace switch; the browser sends the chosen ID thereafter."""

    access = access_context_for_workspace(db, user, payload.workspace_id)
    return _safe_user(db, access)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        key=settings.auth_cookie_name,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
