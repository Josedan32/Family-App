from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateInviteRequest(BaseModel):
    role_granted: Literal["admin", "adult", "teen", "guest"]
    expires_in_days: int = Field(default=7, ge=1, le=90)
    max_uses: int = Field(default=1, ge=1, le=20)


class InviteResponse(BaseModel):
    id: UUID
    code: str
    role_granted: str
    expires_at: datetime
    max_uses: int
    uses: int
    revoked_at: datetime | None


class JoinHouseholdRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)
