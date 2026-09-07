from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.schemas.household import (
    CreateHouseholdRequest, HouseholdDetailResponse, HouseholdResponse,
)
from family_api.schemas.member import MemberResponse
from family_api.security.deps import CurrentUser
from family_api.services import households as household_service
from family_api.services.members import CurrentMember, derive_age

router = APIRouter(prefix="/households", tags=["households"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create(
    body: CreateHouseholdRequest, user: CurrentUser, session: SessionDep
) -> HouseholdResponse:
    household, member = await household_service.create_household(
        session, user, body.name, body.currency, body.timezone
    )
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )


@router.get("/current")
async def current(member: CurrentMember, session: SessionDep) -> HouseholdDetailResponse:
    household = await session.get(Household, member.household_id)
    if household is None:
        raise NotFoundError

    rows = (
        await session.execute(
            select(HouseholdMember, User)
            .join(User, User.id == HouseholdMember.user_id)
            .where(HouseholdMember.household_id == household.id)
        )
    ).all()

    return HouseholdDetailResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
        members=[
            MemberResponse(
                id=m.id, display_name=u.display_name, photo_url=u.photo_url,
                relationship=m.relationship, role=m.role, status=m.status,
                age=derive_age(u.birth_date),
            )
            for m, u in rows
        ],
    )
