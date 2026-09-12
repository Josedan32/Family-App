from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household_expense import HouseholdExpense
from family_api.ids import new_id


@pytest.mark.asyncio
async def test_pot_funded_rows_must_not_name_a_payer(
    db_session: AsyncSession, make_user
) -> None:
    """The CHECK is the backstop for FR-M4-10."""
    from family_api.services.households import create_household

    user = await make_user()
    household, _ = await create_household(db_session, user, "Hogar")
    category = (await db_session.scalars(__import__(
        "sqlalchemy").select(__import__(
        "family_api.db.models.seeded", fromlist=["Category"]).Category))).first()

    db_session.add(
        HouseholdExpense(
            id=new_id(), household_id=household.id, category_id=category.id,
            amount_minor=1_200_000, occurred_on=date(2026, 9, 3),
            funding="pot", paid_by_member_id=new_id(),
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


@pytest.mark.asyncio
async def test_member_funded_rows_require_a_payer_and_a_transaction() -> None:
    table = HouseholdExpense.__table__
    names = {c.name for c in table.constraints if c.name}
    assert "ck_household_expense_funding" in names


@pytest.mark.asyncio
async def test_one_transaction_belongs_to_at_most_one_household_expense() -> None:
    assert HouseholdExpense.__table__.columns["expense_transaction_id"].unique is True


@pytest.mark.asyncio
async def test_contributions_carry_an_in_kind_flag() -> None:
    """FR-M4-12."""
    from family_api.db.models.contribution import Contribution

    column = Contribution.__table__.columns["in_kind"]
    assert column.nullable is False


@pytest.mark.asyncio
async def test_no_stored_pot_balance_column_exists() -> None:
    """FR-M4-13: derived, never stored."""
    from family_api.db.models.household import Household

    assert "pot_balance_minor" not in Household.__table__.columns
