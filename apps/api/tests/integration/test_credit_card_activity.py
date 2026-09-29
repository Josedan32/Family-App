# apps/api/tests/integration/test_credit_card_activity.py
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.household import HouseholdMember
from family_api.ids import new_id
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
    await credit_card_service.add_payment(db_session, member, card.id, 50_000, date(2026, 1, 11), None)
    balance = await credit_card_service.current_cycle_balance(db_session, card, date(2026, 1, 12))
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
