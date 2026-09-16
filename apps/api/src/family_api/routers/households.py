from typing import Annotated
from uuid import UUID as UUIDType

from fastapi import APIRouter, Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import get_session
from family_api.errors import NotFoundError
from family_api.ratelimit import check_rate_limit
from family_api.schemas.household import (
    CreateHouseholdRequest,
    HouseholdDetailResponse,
    HouseholdResponse,
    UpdateHouseholdRequest,
)
from family_api.schemas.invite import CreateInviteRequest, InviteResponse, JoinHouseholdRequest
from family_api.schemas.member import MemberResponse, UpdateMemberRequest
from family_api.security.deps import CurrentUser
from family_api.services import households as household_service
from family_api.services import invites as invite_service
from family_api.services import members as member_service
from family_api.services.members import CurrentMember, derive_age, require_admin

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
        timezone=household.timezone, my_role=member.role, my_member_id=member.id,
        members=[
            MemberResponse(
                id=m.id, display_name=u.display_name, photo_url=u.photo_url,
                relationship=m.relationship, role=m.role, status=m.status,
                age=derive_age(u.birth_date),
            )
            for m, u in rows
        ],
    )


@router.patch("/current")
async def update_household(
    body: UpdateHouseholdRequest, member: CurrentMember, session: SessionDep
) -> HouseholdResponse:
    require_admin(member)
    household = await session.get(Household, member.household_id)
    if household is None:
        raise NotFoundError
    if body.name is not None:
        household.name = body.name
    if body.timezone is not None:
        household.timezone = body.timezone
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )


@router.post("/current/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(
    body: CreateInviteRequest, member: CurrentMember, session: SessionDep
) -> InviteResponse:
    invite = await invite_service.issue_invite(
        session, member, body.role_granted, body.expires_in_days, body.max_uses
    )
    await session.commit()
    return InviteResponse.model_validate(invite, from_attributes=True)


@router.get("/current/invites")
async def list_invites(member: CurrentMember, session: SessionDep) -> list[InviteResponse]:
    rows = await invite_service.list_invites(session, member)
    return [InviteResponse.model_validate(r, from_attributes=True) for r in rows]


@router.delete("/current/invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invite(
    invite_id: UUIDType, member: CurrentMember, session: SessionDep
) -> None:
    await invite_service.revoke_invite(session, member, invite_id)
    await session.commit()


@router.post("/join", status_code=status.HTTP_201_CREATED)
async def join(
    body: JoinHouseholdRequest, user: CurrentUser, session: SessionDep, request: Request
) -> HouseholdResponse:
    # The household's front door. Rate limited hard.
    client_host = request.client.host if request.client else "unknown"
    check_rate_limit(f"join:{client_host}", get_settings().rate_limit_invite_per_hour, 3600)

    member = await invite_service.redeem_invite(session, user, body.code)
    household = await session.get(Household, member.household_id)
    assert household is not None
    await session.commit()
    return HouseholdResponse(
        id=household.id, name=household.name, currency=household.currency,
        timezone=household.timezone, my_role=member.role,
    )


@router.patch("/current/members/{member_id}")
async def update_member(
    member_id: UUIDType,
    body: UpdateMemberRequest,
    member: CurrentMember,
    session: SessionDep,
) -> MemberResponse:
    updated = await member_service.update_member(
        session, member, member_id, body.role, body.relationship
    )
    user = await session.get(User, updated.user_id)
    assert user is not None
    await session.commit()
    return MemberResponse(
        id=updated.id, display_name=user.display_name, photo_url=user.photo_url,
        relationship=updated.relationship, role=updated.role, status=updated.status,
        age=derive_age(user.birth_date),
    )


@router.delete("/current/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_member(
    member_id: UUIDType, member: CurrentMember, session: SessionDep
) -> None:
    await member_service.deactivate_member(session, member, member_id)
    await session.commit()
