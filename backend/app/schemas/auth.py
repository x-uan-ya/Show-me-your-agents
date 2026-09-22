"""Public authentication request and response contracts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

UserRole = Literal["admin", "strategist", "reviewer", "viewer"]
ClientRole = Literal["strategist", "reviewer", "viewer"]


class EmailRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        email = value.strip().casefold()
        if "@" not in email or email.startswith("@") or email.endswith("@"):
            raise ValueError("Enter a valid email address")
        return email


class LoginRequest(EmailRequest):
    password: str = Field(min_length=8, max_length=128)


class EmailOtpRequest(EmailRequest):
    pass


class EmailOtpVerifyRequest(EmailRequest):
    code: str = Field(pattern=r"^\d{6}$")


class PasswordResetConfirmRequest(EmailOtpVerifyRequest):
    new_password: str = Field(min_length=8, max_length=128)


class AuthMessage(BaseModel):
    message: str


class RegisterRequest(LoginRequest):
    display_name: str = Field(min_length=2, max_length=128)
    workspace_name: str | None = Field(default=None, min_length=2, max_length=256)

    @field_validator("display_name")
    @classmethod
    def clean_display_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Enter your name")
        return cleaned

    @field_validator("workspace_name")
    @classmethod
    def clean_workspace_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = " ".join(value.split())
        if len(cleaned) < 2:
            raise ValueError("Enter a workspace name")
        return cleaned


class WorkspaceSummary(BaseModel):
    id: int
    name: str
    role: UserRole


class ActiveWorkspaceRequest(BaseModel):
    workspace_id: int = Field(ge=1)


class CurrentUserRead(BaseModel):
    id: int
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    workspace_id: int
    workspace_name: str
    workspaces: list[WorkspaceSummary]
