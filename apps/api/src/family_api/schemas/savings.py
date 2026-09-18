from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateGoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    target_amount_minor: int = Field(gt=0)
    target_date: date | None = None
    priority: Literal["alta", "media", "baja"] = "media"


class CreateEntryRequest(BaseModel):
    kind: Literal["deposit", "withdrawal"]
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None


class SavingsEntryResponse(BaseModel):
    id: UUID
    kind: Literal["deposit", "withdrawal"]
    amount_minor: int
    occurred_on: date
    note: str | None
    currency: str


class SavingsGoalResponse(BaseModel):
    id: UUID
    name: str
    target_amount_minor: int
    target_date: date | None
    priority: Literal["alta", "media", "baja"]
    balance_minor: int
    progress: float
    currency: str
    days_remaining: int | None
    is_overdue: bool
    state: Literal["completado", "en_progreso"]


class SavingsSummaryResponse(BaseModel):
    """Total balance across all goals. No goal names, no goal count."""

    total_balance_minor: int
    currency: str
