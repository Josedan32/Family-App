import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember, InviteCode
from family_api.db.models.user import User
from family_api.errors import (
    InviteExhaustedError,
    InviteExpiredError,
    InviteNotFoundError,
    InviteRevokedError,
    NotFoundError,
)
from family_api.ids import new_id
from family_api.services.assignment import deal_in
from family_api.services.households import assert_not_in_household, seed_visibility
from family_api.services.members import require_admin

# FR-M1-03: excludes 0 O 1 I L so a code can be read aloud across a room.
INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
CODE_LENGTH = 8


def generate_code() -> str:
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(CODE_LENGTH))


async def issue_invite(
    session: AsyncSession,
    member: HouseholdMember,
    role_granted: str,
    expires_in_days: int = 7,
    max_uses: int = 1,
) -> InviteCode:
    require_admin(member)
    invite = InviteCode(
        id=new_id(),
        household_id=member.household_id,
        code=generate_code(),
        role_granted=role_granted,
        expires_at=datetime.now(UTC) + timedelta(days=expires_in_days),
        max_uses=max_uses,
        uses=0,
        created_by=member.id,
    )
    session.add(invite)
    await session.flush()
    return invite


async def list_invites(
    session: AsyncSession, member: HouseholdMember
) -> list[InviteCode]:
    require_admin(member)
    rows = await session.scalars(
        select(InviteCode).where(InviteCode.household_id == member.household_id)
    )
    return list(rows)


async def revoke_invite(
    session: AsyncSession, member: HouseholdMember, invite_id: UUID
) -> None:
    require_admin(member)
    invite = await session.scalar(
        select(InviteCode).where(
            InviteCode.id == invite_id, InviteCode.household_id == member.household_id
        )
    )
    if invite is None:
        raise NotFoundError
    if invite.revoked_at is None:
        invite.revoked_at = datetime.now(UTC)
    await session.flush()


async def redeem_invite(session: AsyncSession, user: User, code: str) -> HouseholdMember:
    await assert_not_in_household(session, user)

    # FOR UPDATE serializes concurrent redemptions of the same code (INV-D-05).
    # The CHECK constraint on (uses <= max_uses) is the backstop if this is
    # ever bypassed.
    invite = await session.scalar(
        select(InviteCode).where(InviteCode.code == code.upper()).with_for_update()
    )
    if invite is None:
        raise InviteNotFoundError
    if invite.revoked_at is not None:
        raise InviteRevokedError
    if invite.expires_at <= datetime.now(UTC):
        raise InviteExpiredError
    if invite.uses >= invite.max_uses:
        raise InviteExhaustedError

    invite.uses += 1
    member = HouseholdMember(
        id=new_id(),
        household_id=invite.household_id,
        user_id=user.id,
        role=invite.role_granted,
        status="active",
    )
    session.add(member)
    await session.flush()

    seed_visibility(session, member)
    await session.flush()
    await deal_in(session, member)
    return member
