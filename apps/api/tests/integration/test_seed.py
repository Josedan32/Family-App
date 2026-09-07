import sys
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import VisibilitySetting

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
from seed import seed_demo_household  # noqa: E402


@pytest.mark.asyncio
async def test_seed_creates_the_spec_household(db_session: AsyncSession) -> None:
    await seed_demo_household(db_session)

    household = await db_session.scalar(select(Household))
    assert household is not None
    assert household.name == "Familia Hernández"
    assert household.currency == "COP"

    members = (await db_session.scalars(select(HouseholdMember))).all()
    assert len(members) == 4
    assert sum(1 for m in members if m.role == "admin") == 1
    assert {m.relationship for m in members} == {"Hijo", "Padre", "Madre", "Hermano"}


@pytest.mark.asyncio
async def test_seed_produces_mixed_visibility(db_session: AsyncSession) -> None:
    """Every level appears, so all three render paths are exercised on first run."""
    await seed_demo_household(db_session)

    levels = {
        s.level for s in (await db_session.scalars(select(VisibilitySetting))).all()
    }
    assert levels == {"private", "summary", "public"}
