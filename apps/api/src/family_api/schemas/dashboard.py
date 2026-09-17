from uuid import UUID

from pydantic import BaseModel


class ModuleCell(BaseModel):
    """One module on one member's card.

    `total_minor` is ABSENT (not null, not zero) when the level is `private`.
    A null would distinguish "private" from "empty", which is itself a
    disclosure (docs/visibility-rules.md §3.2).
    """

    level: str
    total_minor: int | None = None


class CategoryAmount(BaseModel):
    category_name: str
    amount_minor: int


class CategoryBreakdown(BaseModel):
    """Same omission semantics as `ModuleCell`.

    `rows` is ABSENT (not null, not an empty list) when the level is
    `private` — an empty list would still disclose "no expenses", which is a
    figure (docs/visibility-rules.md §3.2).
    """

    level: str
    rows: list[CategoryAmount] | None = None


class HouseholdTotals(BaseModel):
    income_minor: int
    expenses_minor: int
    savings_minor: int
    # Household-ledger expenses (HouseholdExpense), not the sum of members'
    # personal expense transactions above — see docstring on
    # services.dashboard.build_dashboard. Always visible: this is a
    # household-wide total, the same exemption as the totals it sits beside.
    expenses_by_category: list[CategoryAmount]


class ContributionSummary(BaseModel):
    goal_amount_minor: int
    collected_minor: int
    progress: float


class PotSummary(BaseModel):
    collected_minor: int
    spent_minor: int
    balance_minor: int


class MemberCard(BaseModel):
    member_id: UUID
    display_name: str
    relationship: str | None
    photo_url: str | None
    income: ModuleCell
    expenses: ModuleCell
    savings: ModuleCell
    debts: ModuleCell
    expenses_by_category: CategoryBreakdown


class DashboardResponse(BaseModel):
    period: str
    currency: str
    household: HouseholdTotals
    contribution: ContributionSummary | None
    pot: PotSummary
    members: list[MemberCard]
