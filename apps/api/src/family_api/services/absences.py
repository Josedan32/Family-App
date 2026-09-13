from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.chore import MemberAbsence
from family_api.db.models.household import HouseholdMember
from family_api.errors import ForbiddenRoleError, NotFoundError
from family_api.ids import new_id


async def absent_member_ids(
    session: AsyncSession, household_id: UUID, on: date
) -> set[UUID]:
    rows = await session.scalars(
        select(MemberAbsence.member_id).where(
            MemberAbsence.household_id == household_id,
            MemberAbsence.starts_on <= on,
            MemberAbsence.ends_on >= on,
        )
    )
    return set(rows)


async def create_absence(
    session: AsyncSession,
    member: HouseholdMember,
    starts_on: date,
    ends_on: date,
    reason: str | None,
) -> MemberAbsence:
    """Self only. You declare your own absence; nobody declares it for you."""
    absence = MemberAbsence(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        starts_on=starts_on, ends_on=ends_on, reason=reason,
    )
    session.add(absence)
    await session.flush()
    return absence


async def list_absences(
    session: AsyncSession, member: HouseholdMember
) -> list[MemberAbsence]:
    return list(
        await session.scalars(
            select(MemberAbsence)
            .where(MemberAbsence.member_id == member.id)
            .order_by(MemberAbsence.starts_on.desc())
        )
    )


async def delete_absence(
    session: AsyncSession, member: HouseholdMember, absence_id: UUID
) -> None:
    absence = await session.scalar(
        select(MemberAbsence).where(MemberAbsence.id == absence_id)
    )
    if absence is None or absence.household_id != member.household_id:
        raise NotFoundError
    if absence.member_id != member.id and member.role != "admin":
        raise ForbiddenRoleError
    await session.delete(absence)
    await session.flush()
