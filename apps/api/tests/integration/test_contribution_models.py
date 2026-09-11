import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.contribution import ContributionPeriod
from family_api.db.models.household import Household
from family_api.ids import new_id


async def _household(session: AsyncSession, user_id) -> Household:
    household = Household(
        id=new_id(), name="Hogar", currency="COP",
        timezone="America/Bogota", created_by=user_id,
    )
    session.add(household)
    await session.flush()
    return household


@pytest.mark.asyncio
async def test_period_month_must_be_the_first_of_the_month(
    db_session: AsyncSession, make_user
) -> None:
    from datetime import date

    user = await make_user()
    household = await _household(db_session, user.id)

    db_session.add(
        ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 15), goal_amount_minor=2_000_000,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_only_one_period_per_household_per_month(
    db_session: AsyncSession, make_user
) -> None:
    """FR-M4-01."""
    from datetime import date

    user = await make_user()
    household = await _household(db_session, user.id)

    for _ in range(2):
        db_session.add(
            ContributionPeriod(
                id=new_id(), household_id=household.id,
                period_month=date(2026, 9, 1), goal_amount_minor=2_000_000,
            )
        )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_contribution_requires_a_linked_expense_transaction() -> None:
    """INV-D-01: the FK is NOT NULL, so an unmirrored contribution is impossible."""
    from family_api.db.models.contribution import Contribution

    column = Contribution.__table__.columns["expense_transaction_id"]
    assert column.nullable is False
    assert column.unique is True
