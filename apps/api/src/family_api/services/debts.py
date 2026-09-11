from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.debt import Debt, DebtPayment
from family_api.db.models.household import HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id


class OverpaymentError(DomainError):
    type_slug = "overpayment"
    status = 409
    title = "El pago supera el saldo pendiente"


async def create_debt(
    session: AsyncSession,
    member: HouseholdMember,
    creditor_type: str,
    creditor_label: str,
    principal_minor: int,
    annual_interest_rate: float | None,
    due_day: int | None,
) -> Debt:
    debt = Debt(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        creditor_type=creditor_type, creditor_label=creditor_label,
        principal_minor=principal_minor, annual_interest_rate=annual_interest_rate,
        due_day=due_day, status="active",
    )
    session.add(debt)
    await session.flush()
    return debt


async def _paid_total(session: AsyncSession, debt_id: UUID) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(DebtPayment.amount_minor), 0)).where(
            DebtPayment.debt_id == debt_id
        )
    )
    return int(total or 0)


async def list_debts_with_outstanding(
    session: AsyncSession, member_id: UUID
) -> list[tuple[Debt, int]]:
    stmt = (
        select(
            Debt,
            Debt.principal_minor - func.coalesce(func.sum(DebtPayment.amount_minor), 0),
        )
        .outerjoin(DebtPayment, DebtPayment.debt_id == Debt.id)
        .where(Debt.member_id == member_id, Debt.status != "cancelled")
        .group_by(Debt.id)
        .order_by(Debt.creditor_label)
    )
    return [(debt, int(out or 0)) for debt, out in (await session.execute(stmt)).all()]


async def total_outstanding(session: AsyncSession, member_id: UUID) -> int:
    """The single number the debts summary returns."""
    rows = await list_debts_with_outstanding(session, member_id)
    return sum(out for _, out in rows)


async def add_payment(
    session: AsyncSession,
    member: HouseholdMember,
    debt_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
) -> Debt:
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id).with_for_update()
    )
    if debt is None:
        raise NotFoundError

    outstanding = debt.principal_minor - await _paid_total(session, debt.id)
    if amount_minor > outstanding:
        raise OverpaymentError

    session.add(
        DebtPayment(
            id=new_id(), household_id=debt.household_id, debt_id=debt.id,
            amount_minor=amount_minor, paid_on=paid_on, note=note,
        )
    )
    await session.flush()

    debt.status = "paid" if outstanding - amount_minor == 0 else "active"
    await session.flush()
    return debt
