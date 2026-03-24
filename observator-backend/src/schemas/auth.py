from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=6)
    display_name: str = Field(..., min_length=1, max_length=200)


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=200)
    password: str = Field(..., min_length=4)


class LoginResponse(BaseModel):
    token: str
    role: str
    user: "UserOut"


class UserOut(BaseModel):
    user_id: UUID
    email: str
    display_name: str | None
    role: str

    model_config = {"from_attributes": True}
