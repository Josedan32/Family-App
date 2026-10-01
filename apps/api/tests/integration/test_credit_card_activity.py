# apps/api/tests/integration/test_credit_card_activity.py
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.credit_card import CreditCard
from family_api.db.models.household import HouseholdMember
from family_api.services import credit_cards as credit_card_service
from family_api.services.households import create_household


async def _member(db_session: AsyncSession, make_user) -> HouseholdMember:
    user = await make_user()
    _, member = await create_household(db_session, user, "Hogar")
    await db_session.flush()
    return member


@pytest.mark.asyncio
async def test_delete_purchase_before_any_statement_is_allowed(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await credit_card_service.create_card(
        db_session, member, "Visa", "Bancolombia", 5_000_000,
        Decimal("2.5"), Decimal("5"), None, 15, 15,
    )
    purchase = await credit_card_service.add_purchase(
        db_session, member, card.id, "Mercado", None, 50_000, date(2026, 1, 10),
        None, None, None,
    )
    await credit_card_service.delete_purchase(db_session, member, card.id, purchase.id)
    _, purchases, _, _ = await credit_card_service.get_card_detail(db_session, member, card.id)
    assert purchases == []


@pytest.mark.asyncio
async def test_delete_purchase_already_billed_is_rejected(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await credit_card_service.create_card(
        db_session, member, "Visa", "Bancolombia", 5_000_000,
        Decimal("2.5"), Decimal("5"), None, 15, 15,
    )
    await db_session.execute(
        card.__table__.update().where(card.__table__.c.id == card.id)
        .values(created_at=date(2026, 1, 1))
    )
    await db_session.refresh(card)
    purchase = await credit_card_service.add_purchase(
        db_session, member, card.id, "Mercado", None, 50_000, date(2026, 1, 10),
        None, None, None,
    )
    await credit_card_service.ensure_statements_current(db_session, card, today=date(2026, 1, 20))

    with pytest.raises(credit_card_service.PurchaseAlreadyBilledError):
        await credit_card_service.delete_purchase(db_session, member, card.id, purchase.id)


@pytest.mark.asyncio
async def test_overpayment_style_full_payment_zeroes_the_provisional_balance(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await credit_card_service.create_card(
        db_session, member, "Visa", "Bancolombia", 5_000_000,
        Decimal("2.5"), Decimal("5"), None, 15, 15,
    )
    await credit_card_service.add_purchase(
        db_session, member, card.id, "Mercado", None, 50_000, date(2026, 1, 10),
        None, None, None,
    )
    await credit_card_service.add_payment(
        db_session, member, card.id, 50_000, date(2026, 1, 11), None
    )
    balance = await credit_card_service.current_cycle_balance(
        db_session, card, date(2026, 1, 12)
    )
    assert balance == 0


@pytest.mark.asyncio
async def test_delete_card_with_purchases_is_rejected(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await credit_card_service.create_card(
        db_session, member, "Visa", "Bancolombia", 5_000_000,
        Decimal("2.5"), Decimal("5"), None, 15, 15,
    )
    await credit_card_service.add_purchase(
        db_session, member, card.id, "Mercado", None, 50_000, date(2026, 1, 10),
        None, None, None,
    )
    with pytest.raises(credit_card_service.CreditCardHasActivityError):
        await credit_card_service.delete_card(db_session, member, card.id)


async def _backdated_card(db_session: AsyncSession, member: HouseholdMember) -> CreditCard:
    card = await credit_card_service.create_card(
        db_session, member, "Visa", "Bancolombia", 5_000_000,
        Decimal("2.5"), Decimal("5"), None, 15, 15,
    )
    await db_session.execute(
        card.__table__.update().where(card.__table__.c.id == card.id)
        .values(created_at=date(2026, 1, 1))
    )
    await db_session.refresh(card)
    return card


@pytest.mark.asyncio
async def test_provisional_balance_counts_only_installments_due_so_far(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _backdated_card(db_session, member)
    await credit_card_service.add_purchase(
        db_session, member, card.id, "Televisor", None, 300_000, date(2026, 1, 3),
        3, 100_000, date(2026, 1, 5),
    )

    before_first_due = await credit_card_service.current_cycle_balance(
        db_session, card, date(2026, 1, 4)
    )
    after_first_due = await credit_card_service.current_cycle_balance(
        db_session, card, date(2026, 1, 10)
    )

    assert before_first_due == 0
    assert after_first_due == 100_000


@pytest.mark.asyncio
async def test_a_paid_off_cash_purchase_nets_to_zero_in_the_provisional_balance(
    db_session: AsyncSession, make_user
) -> None:
    member = await _member(db_session, make_user)
    card = await _backdated_card(db_session, member)
    await credit_card_service.add_purchase(
        db_session, member, card.id, "Mercado", None, 50_000, date(2026, 1, 10),
        None, None, None,
    )

    unpaid = await credit_card_service.current_cycle_balance(db_session, card, date(2026, 1, 10))
    await credit_card_service.add_payment(
        db_session, member, card.id, 50_000, date(2026, 1, 11), None
    )
    paid = await credit_card_service.current_cycle_balance(db_session, card, date(2026, 1, 12))

    assert unpaid == 50_000
    assert paid == 0
