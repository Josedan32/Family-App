from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.schemas.chore import (
    ChoreResponse,
    CreateAdjustmentRequest,
    CreateChoreRequest,
    EffortBalancesResponse,
    UpdateChoreRequest,
)
from family_api.services import chores as chore_service
from family_api.services import effort as effort_service
from family_api.services.members import CurrentMember

router = APIRouter(prefix="", tags=["chores"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("/chores")
async def list_chores(
    member: CurrentMember, session: SessionDep, include_archived: bool = False
) -> list[ChoreResponse]:
    rows = await chore_service.list_chores(session, member, include_archived)
    return [ChoreResponse.model_validate(r, from_attributes=True) for r in rows]


@router.post("/chores", status_code=status.HTTP_201_CREATED)
async def create_chore(
    body: CreateChoreRequest, member: CurrentMember, session: SessionDep
) -> ChoreResponse:
    chore = await chore_service.create_chore(
        session, member, body.name, body.description, body.frequency, body.effort_points
    )
    await session.commit()
    return ChoreResponse.model_validate(chore, from_attributes=True)


@router.patch("/chores/{chore_id}")
async def update_chore(
    chore_id: UUID, body: UpdateChoreRequest, member: CurrentMember, session: SessionDep
) -> ChoreResponse:
    chore = await chore_service.update_chore(
        session, member, chore_id, body.name, body.description,
        body.frequency, body.effort_points,
    )
    await session.commit()
    return ChoreResponse.model_validate(chore, from_attributes=True)


@router.delete("/chores/{chore_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_chore(
    chore_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await chore_service.archive_chore(session, member, chore_id)
    await session.commit()


@router.get("/effort-balances")
async def get_effort_balances(
    member: CurrentMember, session: SessionDep
) -> EffortBalancesResponse:
    household = await session.get(Household, member.household_id)
    assert household is not None
    today = date.today()
    rows = await effort_service.balance_rows(session, household, today)
    return EffortBalancesResponse(
        window_days=household.effort_window_days,
        window_start=effort_service.window_start(household, today),
        members=rows,
    )


@router.post("/effort-adjustments", status_code=status.HTTP_201_CREATED)
async def create_effort_adjustment(
    body: CreateAdjustmentRequest, member: CurrentMember, session: SessionDep
) -> None:
    await effort_service.create_adjustment(
        session, member, body.member_id, body.points, body.reason
    )
    await session.commit()
