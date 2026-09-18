from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.periods import parse_period
from family_api.schemas.dashboard import (
    CategoryAmount,
    CategoryBreakdown,
    ContributionSummary,
    DashboardResponse,
    HouseholdTotals,
    MemberCard,
    ModuleCell,
    PotSummary,
)
from family_api.services import contributions as contribution_service
from family_api.services import debts as debt_service
from family_api.services import savings as savings_service
from family_api.services import transactions as transaction_service
from family_api.services.household_expenses import (
    category_breakdown as household_category_breakdown,
)
from family_api.services.household_expenses import pot_figures
from family_api.services.visibility import Level, resolve


async def _cell(
    session: AsyncSession,
    viewer: HouseholdMember,
    owner: HouseholdMember,
    module: str,
    value: int,
) -> ModuleCell:
    level = await resolve(session, viewer, owner, module)
    if level is Level.NONE:
        # No figure at all. Not null, not zero.
        return ModuleCell(level="private")
    return ModuleCell(level=level.value, total_minor=value)


async def _category_breakdown_cell(
    session: AsyncSession,
    viewer: HouseholdMember,
    owner: HouseholdMember,
    module: str,
    rows: list[tuple[str, int]],
) -> CategoryBreakdown:
    """Same gating decision as `_cell`, reusing `resolve` — no parallel
    visibility mechanism."""
    level = await resolve(session, viewer, owner, module)
    if level is Level.NONE:
        return CategoryBreakdown(level="private")
    return CategoryBreakdown(
        level=level.value,
        rows=[CategoryAmount(category_name=name, amount_minor=amount) for name, amount in rows],
    )


async def build_dashboard(
    session: AsyncSession, viewer: HouseholdMember, period: str | None
) -> DashboardResponse:
    household = await session.get(Household, viewer.household_id)
    assert household is not None
    start, end = parse_period(period, household.timezone)
    period_label = f"{start.year:04d}-{start.month:02d}"

    rows = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(
                HouseholdMember.household_id == household.id,
                HouseholdMember.status == "active",
            )
        )
    ).all()

    household_income = household_expenses = household_savings = 0
    cards: list[MemberCard] = []

    for owner, user in rows:
        income = await transaction_service.total_for(session, owner.id, "income", start, end)
        expenses = await transaction_service.total_for(
            session, owner.id, "expense", start, end
        )
        savings = await savings_service.total_balance(session, owner.id)
        debts = await debt_service.total_outstanding(session, owner.id)
        expense_rows = await transaction_service.category_breakdown_for(
            session, owner.id, "expense", start, end
        )

        # FR-D1-02: household totals include EVERY member, private ones
        # included. See spec §8.4 for why suppression was rejected.
        household_income += income
        household_expenses += expenses
        household_savings += savings

        cards.append(
            MemberCard(
                member_id=owner.id, display_name=user.display_name,
                relationship=owner.relationship, photo_url=user.photo_url,
                income=await _cell(session, viewer, owner, "income", income),
                expenses=await _cell(session, viewer, owner, "expenses", expenses),
                savings=await _cell(session, viewer, owner, "savings", savings),
                debts=await _cell(session, viewer, owner, "debts", debts),
                expenses_by_category=await _category_breakdown_cell(
                    session, viewer, owner, "expenses", expense_rows
                ),
            )
        )

    open_period = await contribution_service.get_open_period(session, household.id)
    contribution = None
    if open_period is not None:
        collected, _, _ = await contribution_service.period_totals(session, open_period.id)
        contribution = ContributionSummary(
            goal_amount_minor=open_period.goal_amount_minor,
            collected_minor=collected,
            progress=collected / open_period.goal_amount_minor
            if open_period.goal_amount_minor else 0.0,
        )

    figures = await pot_figures(session, household.id)
    household_expense_rows = await household_category_breakdown(
        session, household.id, start, end
    )

    return DashboardResponse(
        period=period_label, currency=household.currency,
        household=HouseholdTotals(
            income_minor=household_income,
            expenses_minor=household_expenses,
            savings_minor=household_savings,
            household_ledger_expenses_by_category=[
                CategoryAmount(category_name=name, amount_minor=amount)
                for name, amount in household_expense_rows
            ],
        ),
        contribution=contribution,
        pot=PotSummary(
            collected_minor=figures.collected_minor,
            spent_minor=figures.spent_minor,
            balance_minor=figures.balance_minor,
        ),
        members=cards,
    )
