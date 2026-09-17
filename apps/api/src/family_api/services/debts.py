from datetime import date
from datetime import date as date_type
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.debt import Debt, DebtPayment
from family_api.db.models.household import HouseholdMember
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
from family_api.services.installments import InstallmentFigures, compute_installments


class OverpaymentError(DomainError):
    type_slug = "overpayment"
    status = 409
    title = "El pago supera el saldo pendiente"


class DebtHasPaymentsError(DomainError):
    type_slug = "debt_has_payments"
    status = 409
    title = "Elimina primero los pagos registrados"


async def create_debt(
    session: AsyncSession,
    member: HouseholdMember,
    name: str,
    creditor_type: str,
    creditor_label: str,
    principal_minor: int,
    annual_interest_rate: float | None,
    due_day: int | None,
    installments_total: int | None = None,
    installment_amount_minor: int | None = None,
    first_installment_on: date | None = None,
    minimum_payment_minor: int | None = None,
) -> Debt:
    debt = Debt(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        name=name, creditor_type=creditor_type, creditor_label=creditor_label,
        principal_minor=principal_minor, annual_interest_rate=annual_interest_rate,
        due_day=due_day, status="active",
        installments_total=installments_total,
        installment_amount_minor=installment_amount_minor,
        first_installment_on=first_installment_on,
        minimum_payment_minor=minimum_payment_minor,
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


async def list_debts_with_figures(
    session: AsyncSession, member_id: UUID, today: date_type | None = None
) -> list[tuple[Debt, int, InstallmentFigures | None]]:
    """Debt, outstanding, and derived installment figures."""
    today = today or date_type.today()
    rows = await list_debts_with_outstanding(session, member_id)
    result = []
    for debt, outstanding in rows:
        paid_total = debt.principal_minor - outstanding
        result.append(
            (
                debt,
                outstanding,
                compute_installments(
                    debt.installments_total,
                    debt.installment_amount_minor,
                    debt.first_installment_on,
                    paid_total,
                    today,
                ),
            )
        )
    return result


async def get_debt_detail(
    session: AsyncSession, member: HouseholdMember, debt_id: UUID
) -> tuple[Debt, int, list[DebtPayment]]:
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id)
    )
    if debt is None:
        raise NotFoundError
    payments = list(
        await session.scalars(
            select(DebtPayment)
            .where(DebtPayment.debt_id == debt.id)
            .order_by(DebtPayment.paid_on.desc(), DebtPayment.id.desc())
        )
    )
    outstanding = debt.principal_minor - sum(p.amount_minor for p in payments)
    return debt, outstanding, payments


async def delete_debt(
    session: AsyncSession, member: HouseholdMember, debt_id: UUID
) -> None:
    """Refuses to delete a debt with payments (INV-D style): erasing it would
    silently drop a ledger trail. The caller must revert the payments first,
    same discipline as the loan/contribution ledgers."""
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id)
    )
    if debt is None:
        raise NotFoundError
    if await _paid_total(session, debt.id) > 0:
        raise DebtHasPaymentsError
    await session.delete(debt)
    await session.flush()


async def add_payment(
    session: AsyncSession,
    member: HouseholdMember,
    debt_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
    payment_method: str = "cash",
) -> tuple[Debt, DebtPayment]:
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id).with_for_update()
    )
    if debt is None:
        raise NotFoundError

    outstanding = debt.principal_minor - await _paid_total(session, debt.id)
    if amount_minor > outstanding:
        raise OverpaymentError

    payment = DebtPayment(
        id=new_id(), household_id=debt.household_id, debt_id=debt.id,
        amount_minor=amount_minor, paid_on=paid_on, note=note,
        payment_method=payment_method,
    )
    session.add(payment)
    await session.flush()

    debt.status = "paid" if outstanding - amount_minor == 0 else "active"
    await session.flush()
    return debt, payment


async def delete_payment(
    session: AsyncSession, member: HouseholdMember, debt_id: UUID, payment_id: UUID
) -> None:
    debt = await session.scalar(
        select(Debt).where(Debt.id == debt_id, Debt.member_id == member.id).with_for_update()
    )
    if debt is None:
        raise NotFoundError

    payment = await session.scalar(
        select(DebtPayment).where(
            DebtPayment.id == payment_id, DebtPayment.debt_id == debt.id
        )
    )
    if payment is None:
        raise NotFoundError

    await session.delete(payment)
    await session.flush()

    outstanding = debt.principal_minor - await _paid_total(session, debt.id)
    if debt.status == "paid" and outstanding > 0:
        debt.status = "active"
        await session.flush()
