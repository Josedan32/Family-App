from datetime import date
from uuid import UUID

from pydantic import BaseModel, Field


class CreatePeriodRequest(BaseModel):
    period_month: date
    goal_amount_minor: int = Field(gt=0)


class UpdatePeriodRequest(BaseModel):
    goal_amount_minor: int | None = Field(default=None, gt=0)


class PledgeItem(BaseModel):
    member_id: UUID
    expected_amount_minor: int = Field(gt=0)


class SetPledgesRequest(BaseModel):
    pledges: list[PledgeItem]


class CreateContributionRequest(BaseModel):
    amount_minor: int = Field(gt=0)
    paid_on: date
    note: str | None = None
    category_id: UUID | None = None


class UpdateContributionRequest(BaseModel):
    amount_minor: int | None = Field(default=None, gt=0)
    paid_on: date | None = None
    note: str | None = None


class PeriodResponse(BaseModel):
    id: UUID
    period_month: date
    goal_amount_minor: int
    status: str
    currency: str


class PeriodMemberRow(BaseModel):
    member_id: UUID
    display_name: str
    pledged_minor: int
    contributed_minor: int


class PeriodDetailResponse(BaseModel):
    """Always visible to every household member (FR-M4-07).

    The household pot is shared money, and FR-M4-04 is unbuildable if members
    can hide their share.
    """

    id: UUID
    period_month: date
    status: str
    goal_amount_minor: int
    collected_minor: int
    progress: float
    currency: str
    members: list[PeriodMemberRow]


class ContributionResponse(BaseModel):
    id: UUID
    member_id: UUID
    amount_minor: int
    currency: str
    paid_on: date
    note: str | None
    expense_transaction_id: UUID
    category_id: UUID | None
