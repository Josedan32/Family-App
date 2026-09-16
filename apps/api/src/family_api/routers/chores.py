from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import ChoreCycle
from family_api.db.models.household import Household
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.schemas.chore import (
    AbsenceResponse,
    AssignmentResponse,
    ChoreResponse,
    CreateAbsenceRequest,
    CreateAdjustmentRequest,
    CreateChoreRequest,
    CreateCycleRequest,
    CycleResponse,
    EffortBalancesResponse,
    ReassignRequest,
    UpdateChoreRequest,
)
from family_api.services import absences as absence_service
from family_api.services import assignment as assignment_service
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
        session, member, body.name, body.description, body.frequency,
        body.effort_points, body.activities, body.requirements, body.expectation,
    )
    await session.commit()
    return ChoreResponse.model_validate(chore, from_attributes=True)


@router.patch("/chores/{chore_id}")
async def update_chore(
    chore_id: UUID, body: UpdateChoreRequest, member: CurrentMember, session: SessionDep
) -> ChoreResponse:
    chore = await chore_service.update_chore(
        session, member, chore_id, body.name, body.description,
        body.frequency, body.effort_points, body.activities,
        body.requirements, body.expectation,
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


async def _cycle_response(session: AsyncSession, cycle: ChoreCycle) -> CycleResponse:
    assignments = await assignment_service.list_cycle_assignments(session, cycle.id)
    return CycleResponse(
        id=cycle.id, starts_on=cycle.starts_on, ends_on=cycle.ends_on,
        seed=cycle.seed,
        assignments=await assignment_service.to_assignment_responses(session, assignments),
    )


@router.post("/chore-cycles", status_code=status.HTTP_201_CREATED)
async def create_chore_cycle(
    body: CreateCycleRequest, member: CurrentMember, session: SessionDep
) -> CycleResponse:
    cycle = await assignment_service.generate_cycle(
        session, member, body.starts_on, body.ends_on
    )
    await session.commit()
    return await _cycle_response(session, cycle)


@router.get("/chore-cycles/current")
async def get_current_chore_cycle(
    member: CurrentMember, session: SessionDep
) -> CycleResponse:
    cycle = await assignment_service.current_cycle(session, member.household_id)
    if cycle is None:
        raise NotFoundError
    return await _cycle_response(session, cycle)


@router.get("/chore-assignments")
async def list_chore_assignments(
    member: CurrentMember, session: SessionDep, member_id: UUID | None = None
) -> list[AssignmentResponse]:
    cycle = await assignment_service.current_cycle(session, member.household_id)
    if cycle is None:
        return []
    assignments = await assignment_service.list_cycle_assignments(session, cycle.id, member_id)
    return await assignment_service.to_assignment_responses(session, assignments)


@router.post("/chore-assignments/{assignment_id}/complete")
async def complete_chore_assignment(
    assignment_id: UUID, member: CurrentMember, session: SessionDep
) -> AssignmentResponse:
    assignment = await assignment_service.complete_assignment(session, member, assignment_id)
    await session.commit()
    responses = await assignment_service.to_assignment_responses(session, [assignment])
    return responses[0]


@router.post("/chore-assignments/{assignment_id}/reassign")
async def reassign_chore_assignment(
    assignment_id: UUID, body: ReassignRequest, member: CurrentMember, session: SessionDep
) -> AssignmentResponse:
    assignment = await assignment_service.reassign_assignment(
        session, member, assignment_id, body.member_id
    )
    await session.commit()
    responses = await assignment_service.to_assignment_responses(session, [assignment])
    return responses[0]


@router.post("/me/absences", status_code=status.HTTP_201_CREATED)
async def create_my_absence(
    body: CreateAbsenceRequest, member: CurrentMember, session: SessionDep
) -> AbsenceResponse:
    absence = await absence_service.create_absence(
        session, member, body.starts_on, body.ends_on, body.reason
    )
    await session.commit()
    return AbsenceResponse.model_validate(absence, from_attributes=True)


@router.get("/me/absences")
async def list_my_absences(
    member: CurrentMember, session: SessionDep
) -> list[AbsenceResponse]:
    rows = await absence_service.list_absences(session, member)
    return [AbsenceResponse.model_validate(r, from_attributes=True) for r in rows]


@router.delete("/me/absences/{absence_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_absence(
    absence_id: UUID, member: CurrentMember, session: SessionDep
) -> None:
    await absence_service.delete_absence(session, member, absence_id)
    await session.commit()
