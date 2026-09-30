from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateCreditCardRequest(BaseModel):
    nickname: str = Field(min_length=1, max_length=120)
    bank_label: str = Field(min_length=1, max_length=120)
    credit_limit_minor: int = Field(gt=0)
    interest_rate_monthly_pct: float = Field(ge=0, le=999.99)
    minimum_payment_pct: float = Field(ge=0, le=999.99)
    minimum_payment_floor_minor: int | None = Field(default=None, gt=0)
    statement_cutoff_day: int = Field(ge=1, le=28)
    payment_due_days: int = Field(default=15, gt=0)


class CreateCreditCardPurchaseRequest(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    category_id: UUID | None = None
    amount_minor: int = Field(gt=0)
    purchased_on: date
    installments_total: int | None = Field(default=None, gt=0, le=60)
    installment_amount_minor: int | None = Field(default=None, gt=0)
    first_installment_on: date | None = None

    @model_validator(mode="after")
    def plan_is_all_or_nothing(self) -> "CreateCreditCardPurchaseRequest":
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


class CreateCreditCardPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date
    note: str | None = None


class CreditCardPurchaseResponse(BaseModel):
    id: UUID
    description: str
    category_id: UUID | None
    amount_minor: int
    purchased_on: date
    installments_total: int | None
    installment_amount_minor: int | None
    first_installment_on: date | None


class CreditCardPaymentResponse(BaseModel):
    id: UUID
    amount_minor: int
    paid_on: date
    note: str | None


class CreditCardStatementResponse(BaseModel):
    id: UUID
    cycle_starts_on: date
    cycle_ends_on: date
    opening_balance_minor: int
    purchases_total_minor: int
    installments_due_minor: int
    interest_charged_minor: int
    payments_total_minor: int
    closing_balance_minor: int
    minimum_payment_minor: int
    payment_due_on: date


class CreditCardResponse(BaseModel):
    id: UUID
    nickname: str
    bank_label: str
    credit_limit_minor: int
    interest_rate_monthly_pct: float
    minimum_payment_pct: float
    minimum_payment_floor_minor: int | None
    statement_cutoff_day: int
    payment_due_days: int
    status: str
    currency: str
    outstanding_minor: int
    current_cycle_balance_minor: int
    credit_used_ratio: float
    latest_statement: CreditCardStatementResponse | None


class CreditCardDetailResponse(CreditCardResponse):
    purchases: list[CreditCardPurchaseResponse]
    payments: list[CreditCardPaymentResponse]
    statements: list[CreditCardStatementResponse]


class CreditCardSummaryResponse(BaseModel):
    """Total outstanding across cards only. No nicknames, no bank labels."""

    total_outstanding_minor: int
    currency: str
