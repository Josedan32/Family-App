from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import ContributionPeriod
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.schemas.contribution import (
    ContributionResponse,
    CreateContributionRequest,
    CreatePeriodRequest,
    PeriodDetailResponse,
    PeriodMemberRow,
    PeriodResponse,
    SetPledgesRequest,
    UpdatePeriodRequest,
)
from family_api.services import contributions as contribution_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="/contribution-periods", tags=["contributions"])
contributions_router = APIRouter(prefix="/contributions", tags=["contributions"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _currency(session: AsyncSession, household_id: UUID) -> str:
    household = await session.get(Household, household_id)
    assert household is not None
    return household.currency


async def _detail(
    session: AsyncSession, member: HouseholdMember, period: ContributionPeriod
) -> PeriodDetailResponse:
    collected, contributed, pledged = await contribution_service.period_totals(
        session, period.id
    )
    rows = (
        await session.execute(
            select(HouseholdMember.id, User.display_name)
            .join(User, User.id == HouseholdMember.user_id)
            .where(
                HouseholdMember.household_id == member.household_id,
                HouseholdMember.status == "active",
            )
        )
    ).all()

    return PeriodDetailResponse(
        id=period.id, period_month=period.period_month, status=period.status,
        goal_amount_minor=period.goal_amount_minor, collected_minor=collected,
        progress=collected / period.goal_amount_minor if period.goal_amount_minor else 0.0,
        currency=await _currency(session, member.household_id),
        members=[
            PeriodMemberRow(
                member_id=member_id, display_name=name,
                pledged_minor=pledged.get(member_id, 0),
                contributed_minor=contributed.get(member_id, 0),
            )
            for member_id, name in rows
        ],
    )


@router.get("")
async def list_periods(
    member: CurrentMember,
    session: SessionDep,
    status_filter: Literal["open", "closed"] | None = None,
) -> list[PeriodResponse]:
    periods = await contribution_service.list_periods(session, member, status_filter)
    currency = await _currency(session, member.household_id)
    return [
        PeriodResponse(
            id=p.id, period_month=p.period_month,
            goal_amount_minor=p.goal_amount_minor, status=p.status, currency=currency,
        )
        for p in periods
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_period(
    body: CreatePeriodRequest, member: CurrentMember, session: SessionDep
) -> PeriodResponse:
    period = await contribution_service.open_period(
        session, member, body.period_month, body.goal_amount_minor
    )
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.get("/current")
async def current_period(
    member: CurrentMember, session: SessionDep
) -> PeriodDetailResponse:
    """Always visible to every household member (FR-M4-07)."""
    period = await contribution_service.get_open_period(session, member.household_id)
    if period is None:
        raise NotFoundError
    return await _detail(session, member, period)


@router.patch("/{period_id}")
async def update_period(
    period_id: UUID,
    body: UpdatePeriodRequest,
    member: CurrentMember,
    session: SessionDep,
) -> PeriodResponse:
    period = await contribution_service.update_period(
        session, member, period_id, body.goal_amount_minor
    )
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.post("/{period_id}/close")
async def close_period(
    period_id: UUID, member: CurrentMember, session: SessionDep
) -> PeriodResponse:
    period = await contribution_service.close_period(session, member, period_id)
    await session.commit()
    return PeriodResponse(
        id=period.id, period_month=period.period_month,
        goal_amount_minor=period.goal_amount_minor, status=period.status,
        currency=await _currency(session, member.household_id),
    )


@router.put("/{period_id}/pledges")
async def set_pledges(
    period_id: UUID,
    body: SetPledgesRequest,
    member: CurrentMember,
    session: SessionDep,
) -> PeriodDetailResponse:
    await contribution_service.set_pledges(
        session, member, period_id,
        [(p.member_id, p.expected_amount_minor) for p in body.pledges],
    )
    await session.commit()
    period = await contribution_service._load_period(session, member, period_id)
    return await _detail(session, member, period)


@router.post("/{period_id}/contributions", status_code=status.HTTP_201_CREATED)
async def record_contribution(
    period_id: UUID,
    body: CreateContributionRequest,
    member: CurrentMember,
    session: SessionDep,
) -> ContributionResponse:
    contribution = await contribution_service.record_contribution(
        session, member, period_id, body.amount_minor, body.paid_on, body.note
    )
    await session.commit()
    return ContributionResponse(
        id=contribution.id, member_id=contribution.member_id,
        amount_minor=contribution.amount_minor,
        currency=await _currency(session, member.household_id),
        paid_on=contribution.paid_on, note=contribution.note,
        expense_transaction_id=contribution.expense_transaction_id,
    )


@contributions_router.delete("/{contribution_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contribution(
    contribution_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await contribution_service.delete_contribution(session, member, contribution_id)
    await session.commit()
