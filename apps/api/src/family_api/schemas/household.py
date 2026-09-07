from uuid import UUID

from pydantic import BaseModel, Field

from family_api.schemas.member import MemberResponse


class CreateHouseholdRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    timezone: str | None = None


class HouseholdResponse(BaseModel):
    id: UUID
    name: str
    currency: str
    timezone: str
    my_role: str


class HouseholdDetailResponse(HouseholdResponse):
    members: list[MemberResponse]
