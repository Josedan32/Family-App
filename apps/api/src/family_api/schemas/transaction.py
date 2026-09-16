from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTransactionRequest(BaseModel):
    kind: Literal["income", "expense"]
    category_id: UUID
    amount_minor: int = Field(gt=0)
    occurred_on: date
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None


class UpdateTransactionRequest(BaseModel):
    category_id: UUID | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    occurred_on: date | None = None
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None


class TransactionResponse(BaseModel):
    id: UUID
    kind: str
    category_id: UUID
    category_name: str
    amount_minor: int
    currency: str
    occurred_on: date
    name: str | None
    note: str | None
    source: str


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
