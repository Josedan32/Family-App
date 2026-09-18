from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CategoryRef(BaseModel):
    id: UUID
    name: str


class CreateTransactionRequest(BaseModel):
    kind: Literal["income", "expense"]
    category_ids: list[UUID] = Field(min_length=1)
    amount_minor: int = Field(gt=0)
    occurred_on: date
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None
    is_recurring: bool = False
    frequency: Literal["monthly", "once", "biweekly"] | None = None
    payment_method: Literal["cash", "nequi", "bancolombia"] = "cash"

    @model_validator(mode="after")
    def recurring_requires_frequency(self) -> "CreateTransactionRequest":
        if self.is_recurring and self.frequency is None:
            raise ValueError("A recurring transaction needs a frequency")
        if not self.is_recurring and self.frequency is not None:
            raise ValueError("frequency is only set on recurring transactions")
        return self


class UpdateTransactionRequest(BaseModel):
    category_ids: list[UUID] | None = Field(default=None, min_length=1)
    amount_minor: int | None = Field(default=None, gt=0)
    occurred_on: date | None = None
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None


class TransactionResponse(BaseModel):
    id: UUID
    kind: str
    categories: list[CategoryRef]
    amount_minor: int
    currency: str
    occurred_on: date
    name: str | None
    note: str | None
    source: str
    is_recurring: bool
    frequency: str | None
    payment_method: str


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    next_cursor: str | None


class MoneyTotalResponse(BaseModel):
    """A summary is exactly one number plus the period it covers.

    docs/visibility-rules.md §3.1: no counts, no breakdowns, no statistics, no
    dates beyond the period bounds, no pagination metadata. Adding a field to
    this model is a security change — read that section first.
    """

    period: str
    total_minor: int
    currency: str
