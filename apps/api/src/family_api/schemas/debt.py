from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateDebtRequest(BaseModel):
    creditor_type: Literal["bank", "family", "credit_card", "addi", "other"]
    creditor_label: str = Field(min_length=1, max_length=120)
    principal_minor: int = Field(gt=0)
    annual_interest_rate: float | None = Field(default=None, ge=0, le=999.99)
    due_day: int | None = Field(default=None, ge=1, le=31)
    installments_total: int | None = Field(default=None, gt=0, le=360)
    installment_amount_minor: int | None = Field(default=None, gt=0)
    first_installment_on: date | None = None

    @model_validator(mode="after")
    def plan_is_all_or_nothing(self) -> "CreateDebtRequest":
        provided = [
            self.installments_total,
            self.installment_amount_minor,
            self.first_installment_on,
        ]
        if any(v is not None for v in provided) and not all(v is not None for v in provided):
            raise ValueError(
                "An installment plan needs installments_total, "
                "installment_amount_minor and first_installment_on together"
            )
        return self


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
    installments_total: int | None = None
    installments_paid: int | None = None
    installments_remaining: int | None = None
    next_installment_on: date | None = None
    next_installment_amount_minor: int | None = None
    is_overdue: bool | None = None
    last_payment_id: UUID | None = None


class DebtSummaryResponse(BaseModel):
    """Total outstanding. No creditor names, no creditor types, no count."""

    total_outstanding_minor: int
    currency: str
