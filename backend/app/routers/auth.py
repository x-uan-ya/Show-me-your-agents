"""Password and email-OTP authentication using an HttpOnly session cookie."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
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
from app.services.auth.tokens import create_session_token

router = APIRouter(prefix="/auth", tags=["authentication"])
logger = logging.getLogger(__name__)

OTP_REQUEST_MESSAGE = (
    "If an active account exists for that email, a verification code has been sent."
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
    if user is None or not user.is_active:
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


@router.post("/register", response_model=CurrentUserRead, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> CurrentUserRead:
    repo = UserRepository(db)
    if repo.by_email(payload.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    try:
        user, membership = repo.create_workspace_owner(
            payload.email,
            payload.password,
            payload.display_name,
            payload.workspace_name,
        )
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists"
        ) from exc
    return _safe_user(
        db,
        access_context_for_workspace(db, user, membership.workspace_id),
    )


@router.post("/login", response_model=CurrentUserRead)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> CurrentUserRead:
    user = UserRepository(db).by_email(payload.email)
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    access = access_context_for_workspace(db, user)

    _set_session_cookie(response, user)
    return _safe_user(db, access)


@router.post(
    "/email-login/request",
    response_model=AuthMessage,
    status_code=status.HTTP_202_ACCEPTED,
)
def request_email_login_code(
    payload: EmailOtpRequest,
    db: Session = Depends(get_db),
) -> AuthMessage:
    return _request_email_otp(payload, "login", db)


@router.post("/email-login/verify", response_model=CurrentUserRead)
def verify_email_login_code(
    payload: EmailOtpVerifyRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> CurrentUserRead:
    user = UserRepository(db).by_email(payload.email)
    if not EmailOtpService(db).verify(user, "login", payload.code):
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
    db: Session = Depends(get_db),
) -> AuthMessage:
    return _request_email_otp(payload, "password_reset", db)


@router.post("/password-reset/confirm", response_model=AuthMessage)
def confirm_password_reset(
    payload: PasswordResetConfirmRequest,
    db: Session = Depends(get_db),
) -> AuthMessage:
    user = UserRepository(db).by_email(payload.email)
    service = EmailOtpService(db)
    if not service.verify(user, "password_reset", payload.code):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid or expired verification code",
        )
    assert user is not None
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
