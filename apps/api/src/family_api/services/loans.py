from datetime import date
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.db.models.loan import MemberLoan, MemberLoanPayment
from family_api.errors import ForbiddenRoleError, NotFoundError
from family_api.ids import new_id
from family_api.services.debts import OverpaymentError
from family_api.services.visibility import Level, resolve


async def _assert_party_is_valid(
    session: AsyncSession, household_id: UUID, member_id: UUID
) -> HouseholdMember:
    member = await session.scalar(
        select(HouseholdMember).where(
            HouseholdMember.id == member_id, HouseholdMember.household_id == household_id
        )
    )
    if member is None:
        raise NotFoundError
    if member.role == "guest":
        # FR-M2-15: a guest has no ledger and cannot be a loan party.
        raise ForbiddenRoleError
    return member


async def create_loan(
    session: AsyncSession,
    actor: HouseholdMember,
    lender_member_id: UUID,
    borrower_member_id: UUID,
    amount_minor: int,
    lent_on: date,
    due_on: date | None,
    note: str | None,
) -> MemberLoan:
    if actor.id not in (lender_member_id, borrower_member_id):
        # You cannot write a debt into two other people's books.
        raise ForbiddenRoleError
    await _assert_party_is_valid(session, actor.household_id, lender_member_id)
    await _assert_party_is_valid(session, actor.household_id, borrower_member_id)

    loan = MemberLoan(
        id=new_id(), household_id=actor.household_id,
        lender_member_id=lender_member_id, borrower_member_id=borrower_member_id,
        amount_minor=amount_minor, lent_on=lent_on, due_on=due_on,
        status="pending", note=note,
    )
    session.add(loan)
    await session.flush()
    return loan


async def _paid_total(session: AsyncSession, loan_id: UUID) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0)).where(
            MemberLoanPayment.loan_id == loan_id
        )
    )
    return int(total or 0)


async def list_loans(
    session: AsyncSession, member: HouseholdMember, role_filter: str = "all"
) -> list[tuple[MemberLoan, int]]:
    """FR-M2-16: both parties always see their own loans, whatever their settings."""
    stmt = select(
        MemberLoan,
        MemberLoan.amount_minor - func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0),
    ).outerjoin(MemberLoanPayment, MemberLoanPayment.loan_id == MemberLoan.id)

    if role_filter == "lender":
        stmt = stmt.where(MemberLoan.lender_member_id == member.id)
    elif role_filter == "borrower":
        stmt = stmt.where(MemberLoan.borrower_member_id == member.id)
    else:
        stmt = stmt.where(
            or_(
                MemberLoan.lender_member_id == member.id,
                MemberLoan.borrower_member_id == member.id,
            )
        )

    stmt = stmt.group_by(MemberLoan.id).order_by(MemberLoan.lent_on.desc())
    return [(loan, int(out or 0)) for loan, out in (await session.execute(stmt)).all()]


async def _load_party_loan(
    session: AsyncSession, member: HouseholdMember, loan_id: UUID
) -> MemberLoan:
    loan = await session.scalar(
        select(MemberLoan)
        .where(
            MemberLoan.id == loan_id,
            MemberLoan.household_id == member.household_id,
            or_(
                MemberLoan.lender_member_id == member.id,
                MemberLoan.borrower_member_id == member.id,
            ),
        )
        .with_for_update()
    )
    if loan is None:
        raise NotFoundError
    return loan


async def add_loan_payment(
    session: AsyncSession,
    member: HouseholdMember,
    loan_id: UUID,
    amount_minor: int,
    paid_on: date,
) -> MemberLoan:
    """Either party may record a payment (FR-M2-14)."""
    loan = await _load_party_loan(session, member, loan_id)
    outstanding = loan.amount_minor - await _paid_total(session, loan.id)
    if amount_minor > outstanding:
        raise OverpaymentError

    session.add(
        MemberLoanPayment(
            id=new_id(), household_id=loan.household_id, loan_id=loan.id,
            amount_minor=amount_minor, paid_on=paid_on, recorded_by_member_id=member.id,
        )
    )
    await session.flush()

    remaining = outstanding - amount_minor
    loan.status = "paid" if remaining == 0 else "partially_paid"
    await session.flush()
    return loan


async def cancel_loan(
    session: AsyncSession, member: HouseholdMember, loan_id: UUID
) -> None:
    """Only the lender may cancel (FR-M2-14)."""
    loan = await _load_party_loan(session, member, loan_id)
    if loan.lender_member_id != member.id:
        raise ForbiddenRoleError
    loan.status = "cancelled"
    await session.flush()


async def list_household_loans(
    session: AsyncSession, viewer: HouseholdMember
) -> list[tuple[MemberLoan, int]]:
    """Every loan in the household the viewer may see.

    docs/visibility-rules.md §5.1:
      - A party to the loan always sees it (FR-M2-16), whatever the settings.
      - Anyone else resolves it against the BORROWER's `debts` setting,
        because a loan is a debt and the borrower is the exposed party.
    """
    stmt = (
        select(
            MemberLoan,
            MemberLoan.amount_minor
            - func.coalesce(func.sum(MemberLoanPayment.amount_minor), 0),
        )
        .outerjoin(MemberLoanPayment, MemberLoanPayment.loan_id == MemberLoan.id)
        .where(MemberLoan.household_id == viewer.household_id)
        .group_by(MemberLoan.id)
        .order_by(MemberLoan.lent_on.desc())
    )
    rows = [(loan, int(out or 0)) for loan, out in (await session.execute(stmt)).all()]

    visible: list[tuple[MemberLoan, int]] = []
    for loan, outstanding in rows:
        if viewer.id in (loan.lender_member_id, loan.borrower_member_id):
            visible.append((loan, outstanding))
            continue

        borrower = await session.get(HouseholdMember, loan.borrower_member_id)
        if borrower is None:
            continue
        if await resolve(session, viewer, borrower, "debts") is not Level.NONE:
            visible.append((loan, outstanding))

    return visible
