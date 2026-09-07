import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import Household, HouseholdMember
from family_api.ids import new_id


async def _household(session: AsyncSession, user_id) -> Household:
    household = Household(
        id=new_id(), name="Familia Hernández", currency="COP",
        timezone="America/Bogota", created_by=user_id,
    )
    session.add(household)
    await session.flush()
    return household


@pytest.mark.asyncio
async def test_household_defaults_to_cop_and_bogota(
    db_session: AsyncSession, make_user
) -> None:
    user = await make_user()
    household = await _household(db_session, user.id)

    assert household.currency == "COP"
    assert household.timezone == "America/Bogota"


@pytest.mark.asyncio
async def test_a_user_belongs_to_at_most_one_household(
    db_session: AsyncSession, make_user
) -> None:
    """FR-M1-02, enforced by UNIQUE(user_id)."""
    user = await make_user()
    first = await _household(db_session, user.id)
    second = await _household(db_session, user.id)

    db_session.add(
        HouseholdMember(id=new_id(), household_id=first.id, user_id=user.id, role="admin")
    )
    await db_session.flush()

    db_session.add(
        HouseholdMember(id=new_id(), household_id=second.id, user_id=user.id, role="adult")
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_membership_defaults_to_active(db_session: AsyncSession, make_user) -> None:
    user = await make_user()
    household = await _household(db_session, user.id)
    member = HouseholdMember(
        id=new_id(), household_id=household.id, user_id=user.id, role="admin"
    )
    db_session.add(member)
    await db_session.flush()
    await db_session.refresh(member)

    assert member.status == "active"
