from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.seeded import VisibilitySetting
from family_api.db.session import get_session
from family_api.ids import new_id
from family_api.schemas.visibility import (
    DISCLOSURES,
    VisibilitySettingsRequest,
    VisibilitySettingsResponse,
)
from family_api.services.households import DEFAULT_VISIBILITY
from family_api.services.members import CurrentMember
from family_api.services.visibility import MODULES

router = APIRouter(prefix="/me/visibility", tags=["visibility"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def _current_levels(session: AsyncSession, member_id: UUID) -> dict[str, str]:
    rows = await session.scalars(
        select(VisibilitySetting).where(VisibilitySetting.member_id == member_id)
    )
    stored = {row.module: row.level for row in rows}
    # A missing row falls back to the module default, never to public (VR-05).
    return {module: stored.get(module, DEFAULT_VISIBILITY[module]) for module in MODULES}


@router.get("")
async def get_visibility(
    member: CurrentMember, session: SessionDep
) -> VisibilitySettingsResponse:
    levels = await _current_levels(session, member.id)
    return VisibilitySettingsResponse(**levels, disclosures=DISCLOSURES)


@router.put("")
async def set_visibility(
    body: VisibilitySettingsRequest, member: CurrentMember, session: SessionDep
) -> VisibilitySettingsResponse:
    """Self only. There is deliberately no route to set another member's
    visibility, for any role (FR-M3-06)."""
    requested = body.model_dump()
    existing = {
        row.module: row
        for row in await session.scalars(
            select(VisibilitySetting).where(VisibilitySetting.member_id == member.id)
        )
    }

    for module in MODULES:
        level = requested[module]
        if module in existing:
            existing[module].level = level
        else:
            session.add(
                VisibilitySetting(
                    id=new_id(), household_id=member.household_id,
                    member_id=member.id, module=module, level=level,
                )
            )

    await session.commit()
    levels = await _current_levels(session, member.id)
    return VisibilitySettingsResponse(**levels, disclosures=DISCLOSURES)
