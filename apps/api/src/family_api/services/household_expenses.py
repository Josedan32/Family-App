from dataclasses import dataclass
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import Contribution
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.household_expense import HouseholdExpense
from family_api.db.models.seeded import Category
from family_api.db.models.transaction import Transaction
from family_api.errors import DomainError, ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.services.contributions import get_open_period


@dataclass(frozen=True)
class PotFigures:
    collected_minor: int
    spent_minor: int
    balance_minor: int


class InsufficientPotError(DomainError):
    type_slug = "insufficient_pot"
    status = 409
    title = "El pozo del hogar no alcanza"


class NoOpenPeriodError(DomainError):
    type_slug = "no_open_period"
    status = 409
    title = "No hay un periodo de aportes abierto"


async def pot_figures(session: AsyncSession, household_id: UUID) -> PotFigures:
    """Derived, never stored (FR-M4-13).

    `collected` counts only NON-in-kind contributions: an in-kind contribution
    went straight from a member's pocket to an expense and never arrived in the
    pot. Counting it here would report cash the household does not have.
    """
    collected = await session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0)).where(
            Contribution.household_id == household_id,
            Contribution.in_kind.is_(False),
        )
    )
    spent = await session.scalar(
        select(func.coalesce(func.sum(HouseholdExpense.amount_minor), 0)).where(
            HouseholdExpense.household_id == household_id,
            HouseholdExpense.funding == "pot",
        )
    )
    collected, spent = int(collected or 0), int(spent or 0)
    return PotFigures(
        collected_minor=collected, spent_minor=spent, balance_minor=collected - spent
    )


async def create_expense(
    session: AsyncSession,
    member: HouseholdMember,
    category_id: UUID,
    amount_minor: int,
    occurred_on: date,
    note: str | None,
    funding: str,
    paid_by_member_id: UUID | None,
    counts_as_contribution: bool,
) -> HouseholdExpense:
    """Writes 1, 2 or 3 rows, always in ONE transaction.

      pot                          -> household_expense
      member                       -> household_expense + transaction
      member + counts_as_contribution
                                   -> household_expense + transaction + contribution,
                                      where the contribution points at the SAME
                                      transaction, so the money leaves the
                                      member's ledger exactly once (FR-M4-12).
    """
    if member.role == "guest":
        raise ForbiddenRoleError

    category = await session.scalar(
        sa_select(Category).where(
            Category.id == category_id,
            Category.household_id == member.household_id,
            Category.kind == "expense",
        )
    )
    if category is None:
        raise NotFoundError

    expense_id = new_id()
    transaction_id: UUID | None = None

    if funding == "pot":
        # Lock the household so two concurrent spends cannot both pass the
        # check and overdraw the pot together (INV-D-09).
        await session.execute(
            sa_select(Household.id)
            .where(Household.id == member.household_id)
            .with_for_update()
        )
        figures = await pot_figures(session, member.household_id)
        if amount_minor > figures.balance_minor:
            raise InsufficientPotError
    else:
        # You may only record what you yourself paid, unless you are an admin.
        if paid_by_member_id != member.id and member.role != "admin":
            raise ForbiddenRoleError

        payer = await session.get(HouseholdMember, paid_by_member_id)
        if payer is None or payer.household_id != member.household_id:
            raise NotFoundError

        transaction = Transaction(
            id=new_id(), household_id=member.household_id, member_id=payer.id,
            kind="expense", category_id=category.id, amount_minor=amount_minor,
            occurred_on=occurred_on, note=note,
            source="household_expense", source_id=expense_id,
        )
        session.add(transaction)
        await session.flush()
        transaction_id = transaction.id

        if counts_as_contribution:
            period = await get_open_period(session, member.household_id)
            if period is None:
                raise NoOpenPeriodError

            session.add(
                Contribution(
                    id=new_id(), household_id=member.household_id,
                    period_id=period.id, member_id=payer.id,
                    amount_minor=amount_minor, paid_on=occurred_on, note=note,
                    expense_transaction_id=transaction.id,
                    # Counts toward the GOAL, never toward the POT (FR-M4-13).
                    in_kind=True,
                )
            )

    expense = HouseholdExpense(
        id=expense_id, household_id=member.household_id, category_id=category.id,
        amount_minor=amount_minor, occurred_on=occurred_on, note=note,
        funding=funding, paid_by_member_id=paid_by_member_id,
        expense_transaction_id=transaction_id,
    )
    session.add(expense)
    await session.flush()
    return expense


async def list_expenses(
    session: AsyncSession,
    household_id: UUID,
    start: date,
    end: date,
    funding: str | None = None,
) -> list[tuple[HouseholdExpense, str, str | None, UUID | None]]:
    """Returns (expense, category_name, payer_name, contribution_id)."""
    from family_api.db.models.user import User

    stmt = (
        sa_select(
            HouseholdExpense, Category.name, User.display_name, Contribution.id,
        )
        .join(Category, Category.id == HouseholdExpense.category_id)
        .outerjoin(
            HouseholdMember, HouseholdMember.id == HouseholdExpense.paid_by_member_id
        )
        .outerjoin(User, User.id == HouseholdMember.user_id)
        .outerjoin(
            Contribution,
            Contribution.expense_transaction_id == HouseholdExpense.expense_transaction_id,
        )
        .where(
            HouseholdExpense.household_id == household_id,
            HouseholdExpense.occurred_on >= start,
            HouseholdExpense.occurred_on <= end,
        )
    )
    if funding is not None:
        stmt = stmt.where(HouseholdExpense.funding == funding)
    stmt = stmt.order_by(HouseholdExpense.occurred_on.desc())
    return [tuple(row) for row in (await session.execute(stmt)).all()]


async def update_expense(
    session: AsyncSession,
    member: HouseholdMember,
    expense_id: UUID,
    category_id: UUID | None,
    occurred_on: date | None,
    note: str | None,
) -> HouseholdExpense:
    """Amount and funding are never accepted here — see
    `UpdateHouseholdExpenseRequest`. Changing either would silently rewrite the
    pot balance or someone's personal ledger."""
    expense = await session.scalar(
        sa_select(HouseholdExpense).where(
            HouseholdExpense.id == expense_id,
            HouseholdExpense.household_id == member.household_id,
        )
    )
    if expense is None:
        raise NotFoundError
    if (
        expense.paid_by_member_id is not None
        and expense.paid_by_member_id != member.id
        and member.role != "admin"
    ):
        raise ForbiddenRoleError

    if category_id is not None:
        category = await session.scalar(
            sa_select(Category).where(
                Category.id == category_id,
                Category.household_id == member.household_id,
                Category.kind == "expense",
            )
        )
        if category is None:
            raise NotFoundError
        expense.category_id = category.id
    if occurred_on is not None:
        expense.occurred_on = occurred_on
    if note is not None:
        expense.note = note

    await session.flush()
    return expense


async def delete_expense(
    session: AsyncSession, member: HouseholdMember, expense_id: UUID
) -> None:
    """Removes the expense, its mirrored transaction and any in-kind
    contribution, atomically and in FK-safe order."""
    expense = await session.scalar(
        sa_select(HouseholdExpense).where(
            HouseholdExpense.id == expense_id,
            HouseholdExpense.household_id == member.household_id,
        )
    )
    if expense is None:
        raise NotFoundError
    if (
        expense.paid_by_member_id is not None
        and expense.paid_by_member_id != member.id
        and member.role != "admin"
    ):
        raise ForbiddenRoleError

    transaction_id = expense.expense_transaction_id
    await session.delete(expense)
    await session.flush()

    if transaction_id is not None:
        contribution = await session.scalar(
            sa_select(Contribution).where(
                Contribution.expense_transaction_id == transaction_id
            )
        )
        if contribution is not None:
            await session.delete(contribution)
            await session.flush()

        transaction = await session.get(Transaction, transaction_id)
        if transaction is not None:
            await session.delete(transaction)
    await session.flush()
