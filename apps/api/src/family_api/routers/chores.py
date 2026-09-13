from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.session import get_session
from family_api.schemas.chore import ChoreResponse, CreateChoreRequest, UpdateChoreRequest
from family_api.services import chores as chore_service
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
