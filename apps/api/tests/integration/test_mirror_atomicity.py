"""L-02: if the contribution write fails partway, NEITHER row survives.

These tests commit for real, so they use their own engine rather than the
rolled-back `db_session` fixture, and clean up explicitly.
"""

from datetime import date

import pytest
from sqlalchemy import delete, select

from family_api.config import get_settings
from family_api.db.models.contribution import Contribution, ContributionPeriod
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.seeded import Category, VisibilitySetting
from family_api.db.models.transaction import Transaction
from family_api.db.models.user import User
from family_api.db.session import engine_for, session_factory_for
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services import contributions as contribution_service
from family_api.services.households import create_household


@pytest.fixture
def factory():
    engine = engine_for(get_settings().test_database_url)
    yield session_factory_for(engine)


@pytest.mark.asyncio
async def test_a_failure_after_the_expense_insert_leaves_no_rows(factory) -> None:
    async with factory() as session:
        user = User(
            id=new_id(), email="atomic@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Atomic",
        )
        session.add(user)
        await session.flush()
        household, member = await create_household(session, user, "Atomicity")
        period = ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 1), goal_amount_minor=2_000_000, status="open",
        )
        session.add(period)
        await session.commit()
        household_id, member_id, period_id = household.id, member.id, period.id

    # Force a failure between the two inserts by removing the category the
    # mirror depends on, mid-flight.
    async with factory() as session:
        member_obj = await session.get(HouseholdMember, member_id)
        assert member_obj is not None
        await session.execute(
            delete(Category).where(
                Category.household_id == household_id, Category.name == "Aporte al hogar"
            )
        )
        await session.flush()

        with pytest.raises(Exception):
            await contribution_service.record_contribution(
                session, member_obj, period_id, 1_000_000, date(2026, 9, 5), None
            )
        await session.rollback()

    async with factory() as session:
        contributions = (await session.scalars(select(Contribution))).all()
        orphans = (
            await session.scalars(
                select(Transaction).where(Transaction.source == "contribution")
            )
        ).all()
        assert contributions == []
        assert orphans == [], "An expense survived without its contribution"

    async with factory() as session:
        await session.execute(
            delete(VisibilitySetting).where(VisibilitySetting.household_id == household_id)
        )
        await session.execute(
            delete(ContributionPeriod).where(ContributionPeriod.household_id == household_id)
        )
        await session.execute(
            delete(HouseholdMember).where(HouseholdMember.household_id == household_id)
        )
        await session.execute(delete(Category).where(Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.email == "atomic@example.com"))
        await session.commit()


@pytest.mark.asyncio
async def test_a_transaction_cannot_be_deleted_while_a_contribution_points_at_it(
    factory,
) -> None:
    """ON DELETE RESTRICT: the database refuses to orphan a contribution."""
    from sqlalchemy.exc import IntegrityError

    async with factory() as session:
        user = User(
            id=new_id(), email="restrict@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Restrict",
        )
        session.add(user)
        await session.flush()
        household, member = await create_household(session, user, "Restrict")
        period = ContributionPeriod(
            id=new_id(), household_id=household.id,
            period_month=date(2026, 9, 1), goal_amount_minor=2_000_000, status="open",
        )
        session.add(period)
        await session.flush()
        contribution = await contribution_service.record_contribution(
            session, member, period.id, 500_000, date(2026, 9, 5), None
        )
        await session.commit()
        household_id = household.id
        transaction_id = contribution.expense_transaction_id

    async with factory() as session:
        transaction = await session.get(Transaction, transaction_id)
        assert transaction is not None
        await session.delete(transaction)
        with pytest.raises(IntegrityError):
            await session.commit()

    async with factory() as session:
        await session.execute(delete(Contribution).where(
            Contribution.household_id == household_id))
        await session.execute(delete(Transaction).where(
            Transaction.household_id == household_id))
        await session.execute(delete(VisibilitySetting).where(
            VisibilitySetting.household_id == household_id))
        await session.execute(delete(ContributionPeriod).where(
            ContributionPeriod.household_id == household_id))
        await session.execute(delete(HouseholdMember).where(
            HouseholdMember.household_id == household_id))
        await session.execute(delete(Category).where(
            Category.household_id == household_id))
        await session.execute(delete(Household).where(Household.id == household_id))
        await session.execute(delete(User).where(User.email == "restrict@example.com"))
        await session.commit()
