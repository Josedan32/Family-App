from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateHouseholdExpenseRequest(BaseModel):
    category_id: UUID
    amount_minor: int = Field(gt=0)
    occurred_on: date
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None
    funding: Literal["pot", "member"]
    paid_by_member_id: UUID | None = None
    counts_as_contribution: bool = False

    @model_validator(mode="after")
    def funding_is_consistent(self) -> "CreateHouseholdExpenseRequest":
        if self.funding == "pot":
            if self.paid_by_member_id is not None:
                raise ValueError("A pot-funded expense has no payer")
            if self.counts_as_contribution:
                raise ValueError("Pot money is already a contribution")
        # A member-funded expense with no paid_by_member_id defaults to the
        # caller (the web sheet has no payer picker — see create_expense).
        return self


class UpdateHouseholdExpenseRequest(BaseModel):
    """Amount and funding are deliberately absent.

    Changing either would silently rewrite the pot balance and, for
    member-funded rows, someone's personal ledger. Delete and re-create.
    """

    category_id: UUID | None = None
    occurred_on: date | None = None
    name: str | None = Field(default=None, max_length=120)
    note: str | None = None


class HouseholdExpenseResponse(BaseModel):
    id: UUID
    category_id: UUID
    category_name: str
    amount_minor: int
    currency: str
    occurred_on: date
    name: str | None
    note: str | None
    funding: str
    paid_by_member_id: UUID | None
    paid_by_name: str | None
    expense_transaction_id: UUID | None
    contribution_id: UUID | None


class PotResponse(BaseModel):
    collected_minor: int
    spent_minor: int
    balance_minor: int
    currency: str
