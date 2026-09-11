from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateGoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target_amount_minor: int = Field(gt=0)
    target_date: date | None = None


class CreateEntryRequest(BaseModel):
    kind: Literal["deposit", "withdrawal"]
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None


class SavingsGoalResponse(BaseModel):
    id: UUID
    name: str
    target_amount_minor: int
    target_date: date | None
    balance_minor: int
    progress: float
    currency: str
