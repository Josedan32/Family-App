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


@pytest.mark.asyncio
async def test_seed_creates_the_spec_contribution_period(
    db_session: AsyncSession,
) -> None:
    """Spec §6.4: target 2.000.000, collected 1.900.000, 95%."""
    from sqlalchemy import func

    from family_api.db.models.contribution import Contribution, ContributionPeriod

    await seed_demo_household(db_session)

    period = await db_session.scalar(select(ContributionPeriod))
    assert period is not None
    assert period.goal_amount_minor == 2_000_000
    assert period.status == "open"

    collected = await db_session.scalar(
        select(func.coalesce(func.sum(Contribution.amount_minor), 0))
    )
    assert collected == 1_900_000


@pytest.mark.asyncio
async def test_every_seeded_contribution_has_a_mirrored_expense(
    db_session: AsyncSession,
) -> None:
    """INV-D-01 holds for seeded data too."""
    from family_api.db.models.contribution import Contribution
    from family_api.db.models.transaction import Transaction

    await seed_demo_household(db_session)

    contributions = (await db_session.scalars(select(Contribution))).all()
    mirrored = (
        await db_session.scalars(
            select(Transaction).where(Transaction.source == "contribution")
        )
    ).all()

    assert len(contributions) == len(mirrored) == 3
    assert {c.expense_transaction_id for c in contributions} == {t.id for t in mirrored}


@pytest.mark.asyncio
async def test_the_seed_spends_part_of_the_pot(db_session: AsyncSession) -> None:
    """The demo household must exercise both funding paths on first run."""
    from family_api.db.models.household_expense import HouseholdExpense

    await seed_demo_household(db_session)

    expenses = (await db_session.scalars(select(HouseholdExpense))).all()
    fundings = {e.funding for e in expenses}

    assert "pot" in fundings
    assert "member" in fundings
