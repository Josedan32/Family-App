from uuid import UUID

from pydantic import BaseModel


class MemberResponse(BaseModel):
    id: UUID
    display_name: str
    photo_url: str | None
    relationship: str | None
    role: str
    status: str
    age: int | None
