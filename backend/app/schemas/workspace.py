"""Workspace membership and client-assignment API contracts."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.auth import ClientRole, UserRole


class WorkspaceRead(BaseModel):
    id: int
    name: str
    role: UserRole


class WorkspaceMemberRead(BaseModel):
    user_id: int
    email: str
    display_name: str
    role: UserRole
    is_active: bool
    created_at: datetime


class WorkspaceMemberAdd(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(min_length=3, max_length=320)
    role: UserRole = "viewer"


class ClientMemberWrite(BaseModel):
    role: ClientRole


class ClientMemberRead(BaseModel):
    user_id: int
    client_id: int
    role: ClientRole
    is_active: bool
