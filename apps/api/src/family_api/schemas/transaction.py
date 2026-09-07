from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTransactionRequest(BaseModel):
    kind: Literal["income", "expense"]
    category_id: UUID
    amount_minor: int = Field(gt=0)
    occurred_on: date
    note: str | None = None


class UpdateTransactionRequest(BaseModel):
    category_id: UUID | None = None
    amount_minor: int | None = Field(default=None, gt=0)
    occurred_on: date | None = None
    note: str | None = None


class TransactionResponse(BaseModel):
    id: UUID
    kind: str
    category_id: UUID
    category_name: str
    amount_minor: int
    currency: str
    occurred_on: date
    note: str | None
    source: str


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    next_cursor: str | None
