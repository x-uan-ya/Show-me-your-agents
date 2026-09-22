"""Local login endpoints using a signed HttpOnly session cookie."""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import CurrentUserRead, LoginRequest, RegisterRequest
from app.services.auth.dependencies import get_current_user
from app.services.auth.passwords import verify_password
from app.services.auth.tokens import create_session_token

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/register", response_model=CurrentUserRead, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> CurrentUserRead:
    repo = UserRepository(db)
    if repo.by_email(payload.email) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    try:
        user = repo.create_strategist(payload.email, payload.password, payload.display_name)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "An account with this email already exists"
        ) from exc
    return CurrentUserRead.model_validate(user)


@router.post("/login", response_model=CurrentUserRead)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> CurrentUserRead:
    user = UserRepository(db).by_email(payload.email)
    if user is None or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=create_session_token(user.id),
        max_age=settings.auth_session_seconds,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite="lax",
        path="/",
    )
    return CurrentUserRead.model_validate(user)


@router.get("/me", response_model=CurrentUserRead)
def current_user(user: User = Depends(get_current_user)) -> CurrentUserRead:
    return CurrentUserRead.model_validate(user)


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
