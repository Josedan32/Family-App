from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateDebtRequest(BaseModel):
    creditor_type: Literal["bank", "family", "credit_card", "addi", "other"]
    creditor_label: str = Field(min_length=1, max_length=120)
    principal_minor: int = Field(gt=0)
    annual_interest_rate: float | None = Field(default=None, ge=0, le=999.99)
    due_day: int | None = Field(default=None, ge=1, le=31)


class CreateDebtPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date
    note: str | None = None


class DebtResponse(BaseModel):
    id: UUID
    creditor_type: str
    creditor_label: str
    principal_minor: int
    outstanding_minor: int
    annual_interest_rate: float | None
    due_day: int | None
    status: str
    currency: str


class DebtSummaryResponse(BaseModel):
    """Total outstanding. No creditor names, no creditor types, no count."""

    total_outstanding_minor: int
    currency: str
