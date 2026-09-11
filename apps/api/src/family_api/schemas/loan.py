from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CreateLoanRequest(BaseModel):
    lender_member_id: UUID
    borrower_member_id: UUID
    amount_minor: int = Field(gt=0)
    lent_on: date
    due_on: date | None = None
    note: str | None = None

    @model_validator(mode="after")
    def parties_must_differ(self) -> "CreateLoanRequest":
        if self.lender_member_id == self.borrower_member_id:
            raise ValueError("Lender and borrower must be different members")
        return self


class CreateLoanPaymentRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date


class LoanResponse(BaseModel):
    id: UUID
    lender_member_id: UUID
    lender_name: str
    borrower_member_id: UUID
    borrower_name: str
    amount_minor: int
    outstanding_minor: int
    currency: str
    lent_on: date
    due_on: date | None
    status: str
    note: str | None
    # "lender" or "borrower" — which side the caller is on.
    perspective: str
