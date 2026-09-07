from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateCategoryRequest(BaseModel):
    kind: Literal["income", "expense"]
    name: str = Field(min_length=1, max_length=60)
    icon: str | None = None


class UpdateCategoryRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    icon: str | None = None


class CategoryResponse(BaseModel):
    id: UUID
    kind: str
    name: str
    icon: str | None
    is_system: bool
    archived_at: datetime | None
