from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.config import get_settings
from family_api.db.models.credit_card import CreditCard, CreditCardPurchase, CreditCardStatement
from family_api.db.models.household import Household, HouseholdMember
from family_api.db.models.user import User
from family_api.db.session import engine_for, session_factory_for
from family_api.ids import new_id
from family_api.security.passwords import hash_password
from family_api.services import credit_cards as credit_card_service
from family_api.services.households import create_household


async def _member(db_session: AsyncSession, make_user) -> HouseholdMember:
    user = await make_user()
    _, member = await create_household(db_session, user, "Hogar")
    await db_session.flush()
    return member


async def _card(db_session: AsyncSession, member: HouseholdMember, created_on: date) -> CreditCard:
    card = CreditCard(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        nickname="Visa", bank_label="Bancolombia", credit_limit_minor=5_000_000,
        interest_rate_monthly_pct=Decimal("2.5"), minimum_payment_pct=Decimal("5"),
        minimum_payment_floor_minor=None, statement_cutoff_day=15, payment_due_days=15,
    )
    db_session.add(card)
    await db_session.flush()
    await db_session.execute(
        card.__table__.update().where(card.__table__.c.id == card.id).values(created_at=created_on)
    )
    await db_session.refresh(card)
    return card


@pytest.mark.asyncio
async def test_generates_one_statement_after_its_cutoff_passes(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    db_session.add(CreditCardPurchase(
        id=new_id(), household_id=member.household_id, card_id=card.id,
        description="Mercado", amount_minor=100_000, purchased_on=date(2026, 1, 10),
    ))
    await db_session.flush()

    statements = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 1, 20)
    )

    assert len(statements) == 1
    assert statements[0].cycle_ends_on == date(2026, 1, 15)
    assert statements[0].purchases_total_minor == 100_000
    assert statements[0].closing_balance_minor == 100_000


@pytest.mark.asyncio
async def test_missed_cutoffs_generate_statements_in_order_with_compounding(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    db_session.add(CreditCardPurchase(
        id=new_id(), household_id=member.household_id, card_id=card.id,
        description="Mercado", amount_minor=100_000, purchased_on=date(2026, 1, 10),
    ))
    await db_session.flush()

    # Member doesn't open the app until well past two cut-offs.
    statements = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 3, 1)
    )

    assert [s.cycle_ends_on for s in statements] == [date(2026, 1, 15), date(2026, 2, 15)]
    assert statements[0].closing_balance_minor == 100_000
    # second cycle: opening 100_000, interest = round(100_000 * 2.5/100) = 2_500
    assert statements[1].opening_balance_minor == 100_000
    assert statements[1].interest_charged_minor == 2_500
    assert statements[1].closing_balance_minor == 102_500


@pytest.mark.asyncio
async def test_calling_ensure_statements_current_twice_does_not_duplicate(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    await db_session.flush()

    first = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 1, 20)
    )
    second = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 1, 20)
    )

    assert len(first) == 1
    assert second == []


@pytest.mark.asyncio
async def test_outstanding_is_zero_before_any_statement_exists(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    await db_session.flush()

    assert await credit_card_service.outstanding_minor(db_session, card.id) == 0


@pytest.mark.asyncio
async def test_editing_the_rate_after_a_statement_exists_does_not_change_it(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    db_session.add(CreditCardPurchase(
        id=new_id(), household_id=member.household_id, card_id=card.id,
        description="Mercado", amount_minor=100_000, purchased_on=date(2026, 1, 10),
    ))
    await db_session.flush()
    first_pass = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 1, 20)
    )
    assert first_pass[0].interest_charged_minor == 0  # opening balance was 0

    # Bank raises the rate; the already-generated statement must not change.
    card.interest_rate_monthly_pct = Decimal("9.99")
    await db_session.flush()

    second_pass = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 2, 20)
    )
    # Second statement uses the NEW rate on the carried balance...
    assert second_pass[0].interest_charged_minor == 9_990  # round(100_000 * 9.99/100)
    # ...but the first statement, already persisted, is untouched.
    unchanged = (await db_session.get(type(first_pass[0]), first_pass[0].id))
    assert unchanged.interest_charged_minor == 0
    assert unchanged.closing_balance_minor == 100_000


@pytest.mark.asyncio
async def test_generated_statements_survive_the_session_that_created_them() -> None:
    """Every other test here shares one rolled-back transaction, which hid
    that generation used to flush without ever committing. A second,
    independent session must see the statement."""
    engine = engine_for(get_settings().test_database_url)
    factory = session_factory_for(engine)

    async with factory() as session:
        user = User(
            id=new_id(), email=f"statement-commit-{new_id()}@example.com",
            password_hash=hash_password("correct-horse-battery"), display_name="Commit",
        )
        session.add(user)
        await session.flush()
        household, member = await create_household(session, user, "Commit")
        card = await _card(session, member, date(2026, 1, 1))
        session.add(CreditCardPurchase(
            id=new_id(), household_id=member.household_id, card_id=card.id,
            description="Mercado", amount_minor=100_000, purchased_on=date(2026, 1, 10),
        ))
        await session.commit()
        user_id, household_id, card_id = user.id, household.id, card.id

    try:
        async with factory() as session:
            loaded = await session.get(CreditCard, card_id)
            assert loaded is not None
            await credit_card_service.ensure_statements_current(
                session, loaded, today=date(2026, 1, 20)
            )
            # No explicit commit: closing the session is what a request does.

        async with factory() as other:
            persisted = list(await other.scalars(
                select(CreditCardStatement).where(CreditCardStatement.card_id == card_id)
            ))
            assert [s.cycle_ends_on for s in persisted] == [date(2026, 1, 15)]
            assert persisted[0].closing_balance_minor == 100_000
    finally:
        async with factory() as session:
            await session.execute(delete(CreditCard).where(CreditCard.id == card_id))
            await session.execute(delete(Household).where(Household.id == household_id))
            await session.execute(delete(User).where(User.id == user_id))
            await session.commit()
        await engine.dispose()


@pytest.mark.asyncio
async def test_purchase_made_exactly_on_cutoff_day_lands_in_that_cycle(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _card(db_session, member, date(2026, 1, 1))
    db_session.add(CreditCardPurchase(
        id=new_id(), household_id=member.household_id, card_id=card.id,
        description="Justo en el corte", amount_minor=25_000, purchased_on=date(2026, 1, 15),
    ))
    await db_session.flush()

    statements = await credit_card_service.ensure_statements_current(
        db_session, card, today=date(2026, 1, 20)
    )

    assert len(statements) == 1
    assert statements[0].cycle_ends_on == date(2026, 1, 15)
    assert statements[0].purchases_total_minor == 25_000
