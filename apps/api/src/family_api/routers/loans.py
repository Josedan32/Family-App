from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.loan import MemberLoan
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.schemas.loan import CreateLoanPaymentRequest, CreateLoanRequest, LoanResponse
from family_api.services import loans as loan_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/loans", tags=["loans"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _names(session: AsyncSession, household_id: UUID) -> dict[UUID, str]:
    rows = (
        await session.execute(
            select(HouseholdMember.id, User.display_name)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household_id)
        )
    ).all()
    return {member_id: name for member_id, name in rows}


async def _render(
    session: AsyncSession, member: HouseholdMember, loan: MemberLoan, outstanding: int
) -> LoanResponse:
    household = await session.get(Household, member.household_id)
    assert household is not None
    names = await _names(session, member.household_id)
    return LoanResponse(
        id=loan.id,
        lender_member_id=loan.lender_member_id,
        lender_name=names.get(loan.lender_member_id, ""),
        borrower_member_id=loan.borrower_member_id,
        borrower_name=names.get(loan.borrower_member_id, ""),
        amount_minor=loan.amount_minor, outstanding_minor=outstanding,
        currency=household.currency, lent_on=loan.lent_on, due_on=loan.due_on,
        status=loan.status, note=loan.note,
        perspective="lender" if loan.lender_member_id == member.id else "borrower",
    )


@router.get("")
async def list_loans(
    member: CurrentMember,
    session: SessionDep,
    role: Literal["lender", "borrower", "all"] = "all",
) -> list[LoanResponse]:
    rows = await loan_service.list_loans(session, member, role)
    return [await _render(session, member, loan, out) for loan, out in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_loan(
    body: CreateLoanRequest, member: CurrentMember, session: SessionDep
) -> LoanResponse:
    loan = await loan_service.create_loan(
        session, member, body.lender_member_id, body.borrower_member_id,
        body.amount_minor, body.lent_on, body.due_on, body.note,
    )
    await session.commit()
    return await _render(session, member, loan, loan.amount_minor)


@router.post("/{loan_id}/payments", status_code=status.HTTP_201_CREATED)
async def add_payment(
    loan_id: UUID,
    body: CreateLoanPaymentRequest,
    member: CurrentMember,
    session: SessionDep,
) -> LoanResponse:
    await loan_service.add_loan_payment(
        session, member, loan_id, body.amount_minor, body.paid_on
    )
    await session.commit()
    rows = await loan_service.list_loans(session, member, "all")
    loan, outstanding = next((loan, out) for loan, out in rows if loan.id == loan_id)
    return await _render(session, member, loan, outstanding)


@router.delete("/{loan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_loan(
    loan_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await loan_service.cancel_loan(session, member, loan_id)
    await session.commit()
