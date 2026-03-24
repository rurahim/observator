"""Admin schemas."""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=6)
    display_name: str | None = None
    role: str = Field(default="ANALYST")


class UserUpdate(BaseModel):
    display_name: str | None = None
    role: str | None = None
    is_active: bool | None = None


class UserOut(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None = None
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditLogOut(BaseModel):
    id: int
    user_id: UUID | None = None
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    details: dict | None = None
    ip_address: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class DataSourceOut(BaseModel):
    dataset_id: str
    filename: str
    source_type: str | None = None
    status: str
    row_count: int | None = None
    created_at: datetime | None = None
    last_refreshed_at: datetime | None = None

    model_config = {"from_attributes": True}
