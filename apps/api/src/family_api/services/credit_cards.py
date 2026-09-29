"""Credit card CRUD and statement orchestration.

Statement generation is the one non-obvious piece: `ensure_statements_current`
is idempotent (Task 5 test 3) and must be called at the top of every read
path that touches a card, exactly like `debt_figures` is recomputed on every
read of a debt — nothing here is a background job.
"""

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from family_api.db.models.credit_card import (
    CreditCard,
    CreditCardPayment,
    CreditCardPurchase,
    CreditCardStatement,
)
from family_api.db.models.household import HouseholdMember
from family_api.db.models.seeded import Category
from family_api.errors import DomainError, NotFoundError
from family_api.ids import new_id
from family_api.services.credit_card_statements import (
    compute_statement,
    installment_due_in_cycle,
    next_cutoff_on_or_after,
)
from family_api.services.transactions import CategoryKindMismatchError


class CreditCardHasActivityError(DomainError):
    type_slug = "credit_card_has_activity"
    status = 409
    title = "Elimina primero las compras y pagos registrados"


class PurchaseAlreadyBilledError(DomainError):
    type_slug = "purchase_already_billed"
    status = 409
    title = "Esta compra ya aparece en un extracto generado"


class PaymentAlreadyBilledError(DomainError):
    type_slug = "payment_already_billed"
    status = 409
    title = "Este pago ya aparece en un extracto generado"


async def create_card(
    session: AsyncSession,
    member: HouseholdMember,
    nickname: str,
    bank_label: str,
    credit_limit_minor: int,
    interest_rate_monthly_pct: Decimal,
    minimum_payment_pct: Decimal,
    minimum_payment_floor_minor: int | None,
    statement_cutoff_day: int,
    payment_due_days: int,
) -> CreditCard:
    card = CreditCard(
        id=new_id(), household_id=member.household_id, member_id=member.id,
        nickname=nickname, bank_label=bank_label, credit_limit_minor=credit_limit_minor,
        interest_rate_monthly_pct=interest_rate_monthly_pct,
        minimum_payment_pct=minimum_payment_pct,
        minimum_payment_floor_minor=minimum_payment_floor_minor,
        statement_cutoff_day=statement_cutoff_day, payment_due_days=payment_due_days,
        status="active",
    )
    session.add(card)
    await session.flush()
    return card


async def _get_owned_card(
    session: AsyncSession, member: HouseholdMember, card_id: UUID
) -> CreditCard:
    card = await session.scalar(
        select(CreditCard).where(CreditCard.id == card_id, CreditCard.member_id == member.id)
    )
    if card is None:
        raise NotFoundError
    return card


async def list_cards(session: AsyncSession, member_id: UUID) -> list[CreditCard]:
    return list(
        await session.scalars(
            select(CreditCard)
            .where(CreditCard.member_id == member_id, CreditCard.status != "cancelled")
            .order_by(CreditCard.nickname)
        )
    )


async def latest_statement(session: AsyncSession, card_id: UUID) -> CreditCardStatement | None:
    statement = await session.scalar(
        select(CreditCardStatement)
        .where(CreditCardStatement.card_id == card_id)
        .order_by(CreditCardStatement.cycle_starts_on.desc())
        .limit(1)
    )
    return statement


async def _all_installment_purchases(
    session: AsyncSession, card_id: UUID
) -> list[CreditCardPurchase]:
    return list(
        await session.scalars(
            select(CreditCardPurchase).where(
                CreditCardPurchase.card_id == card_id,
                CreditCardPurchase.installments_total.is_not(None),
            )
        )
    )


def _installments_due(
    installment_purchases: list[CreditCardPurchase], starts_on: date, ends_on: date
) -> int:
    total = 0
    for p in installment_purchases:
        # Fetched with installments_total IS NOT NULL, and the all-or-nothing
        # CHECK guarantees the other two fields follow (INV-D-13).
        assert p.installments_total is not None
        assert p.installment_amount_minor is not None
        assert p.first_installment_on is not None
        total += installment_due_in_cycle(
            installments_total=p.installments_total,
            installment_amount_minor=p.installment_amount_minor,
            first_installment_on=p.first_installment_on,
            cycle_starts_on=starts_on,
            cycle_ends_on=ends_on,
        )
    return total


async def ensure_statements_current(
    session: AsyncSession, card: CreditCard, today: date
) -> list[CreditCardStatement]:
    """Generates every statement whose cut-off has already passed and that
    does not exist yet, oldest first, each depending on the previous one's
    closing balance (FR-M2-26, FR-M2-27, FR-M2-28).

    Owns its transaction boundary: read routes never commit, and a statement
    that is only flushed is rebuilt from scratch on every request. The row
    lock on the card serializes concurrent readers, so the second one sees
    what the first committed instead of colliding on uq_ccs_card_cycle."""
    generated: list[CreditCardStatement] = []
    await session.execute(
        select(CreditCard.id).where(CreditCard.id == card.id).with_for_update()
    )
    last = await latest_statement(session, card.id)
    cycle_start = (last.cycle_ends_on + timedelta(days=1)) if last else card.created_at.date()
    opening_balance = last.closing_balance_minor if last else 0
    installment_purchases = await _all_installment_purchases(session, card.id)

    while True:
        cycle_end = next_cutoff_on_or_after(card.statement_cutoff_day, cycle_start)
        if cycle_end >= today:
            break

        purchases_total = await session.scalar(
            select(func.coalesce(func.sum(CreditCardPurchase.amount_minor), 0)).where(
                CreditCardPurchase.card_id == card.id,
                CreditCardPurchase.installments_total.is_(None),
                CreditCardPurchase.purchased_on >= cycle_start,
                CreditCardPurchase.purchased_on <= cycle_end,
            )
        )
        payments_total = await session.scalar(
            select(func.coalesce(func.sum(CreditCardPayment.amount_minor), 0)).where(
                CreditCardPayment.card_id == card.id,
                CreditCardPayment.paid_on >= cycle_start,
                CreditCardPayment.paid_on <= cycle_end,
            )
        )
        installments_due = _installments_due(installment_purchases, cycle_start, cycle_end)

        figures = compute_statement(
            opening_balance_minor=opening_balance,
            purchases_total_minor=int(purchases_total or 0),
            installments_due_minor=installments_due,
            payments_total_minor=int(payments_total or 0),
            interest_rate_monthly_pct=Decimal(str(card.interest_rate_monthly_pct)),
            minimum_payment_pct=Decimal(str(card.minimum_payment_pct)),
            minimum_payment_floor_minor=card.minimum_payment_floor_minor,
        )
        statement = CreditCardStatement(
            id=new_id(), household_id=card.household_id, card_id=card.id,
            cycle_starts_on=cycle_start, cycle_ends_on=cycle_end,
            opening_balance_minor=opening_balance,
            purchases_total_minor=int(purchases_total or 0),
            installments_due_minor=installments_due,
            interest_charged_minor=figures.interest_charged_minor,
            payments_total_minor=int(payments_total or 0),
            closing_balance_minor=figures.closing_balance_minor,
            minimum_payment_minor=figures.minimum_payment_minor,
            payment_due_on=cycle_end + timedelta(days=card.payment_due_days),
        )
        session.add(statement)
        await session.flush()
        generated.append(statement)

        opening_balance = figures.closing_balance_minor
        cycle_start = cycle_end + timedelta(days=1)

    if generated:
        await session.commit()
    return generated


async def outstanding_minor(session: AsyncSession, card_id: UUID) -> int:
    last = await latest_statement(session, card_id)
    return last.closing_balance_minor if last else 0


async def current_cycle_balance(session: AsyncSession, card: CreditCard, today: date) -> int:
    """Provisional running total for the not-yet-closed cycle. Never used in
    any visibility summary or debt total (FR-M2-30) — display only.

    Counts the open cycle exactly as `ensure_statements_current` will close
    it: cash purchases in full, installment plans only for what is due."""
    last = await latest_statement(session, card.id)
    cycle_start = (last.cycle_ends_on + timedelta(days=1)) if last else card.created_at.date()
    opening = last.closing_balance_minor if last else 0
    purchases = await session.scalar(
        select(func.coalesce(func.sum(CreditCardPurchase.amount_minor), 0)).where(
            CreditCardPurchase.card_id == card.id,
            CreditCardPurchase.installments_total.is_(None),
            CreditCardPurchase.purchased_on >= cycle_start,
            CreditCardPurchase.purchased_on <= today,
        )
    )
    payments = await session.scalar(
        select(func.coalesce(func.sum(CreditCardPayment.amount_minor), 0)).where(
            CreditCardPayment.card_id == card.id,
            CreditCardPayment.paid_on >= cycle_start,
            CreditCardPayment.paid_on <= today,
        )
    )
    installments_due = _installments_due(
        await _all_installment_purchases(session, card.id), cycle_start, today
    )
    return max(opening + int(purchases or 0) + installments_due - int(payments or 0), 0)


async def total_outstanding(session: AsyncSession, member_id: UUID) -> int:
    cards = await list_cards(session, member_id)
    total = 0
    for card in cards:
        await ensure_statements_current(session, card, date.today())
        total += await outstanding_minor(session, card.id)
    return total


async def payments_in_period(
    session: AsyncSession, member_id: UUID, start: date, end: date
) -> int:
    total = await session.scalar(
        select(func.coalesce(func.sum(CreditCardPayment.amount_minor), 0))
        .select_from(CreditCardPayment)
        .join(CreditCard, CreditCard.id == CreditCardPayment.card_id)
        .where(
            CreditCard.member_id == member_id,
            CreditCardPayment.paid_on >= start,
            CreditCardPayment.paid_on <= end,
        )
    )
    return int(total or 0)


async def _assert_expense_category(
    session: AsyncSession, member: HouseholdMember, category_id: UUID
) -> None:
    """Same rule as a transaction's categories (INV-D-04): the household's
    own, and of the matching kind. A purchase is spending."""
    category = await session.scalar(
        select(Category).where(
            Category.id == category_id, Category.household_id == member.household_id
        )
    )
    if category is None:
        raise NotFoundError
    if category.kind != "expense":
        raise CategoryKindMismatchError


async def add_purchase(
    session: AsyncSession,
    member: HouseholdMember,
    card_id: UUID,
    description: str,
    category_id: UUID | None,
    amount_minor: int,
    purchased_on: date,
    installments_total: int | None,
    installment_amount_minor: int | None,
    first_installment_on: date | None,
) -> CreditCardPurchase:
    card = await _get_owned_card(session, member, card_id)
    if category_id is not None:
        await _assert_expense_category(session, member, category_id)
    purchase = CreditCardPurchase(
        id=new_id(), household_id=card.household_id, card_id=card.id,
        description=description, category_id=category_id, amount_minor=amount_minor,
        purchased_on=purchased_on, installments_total=installments_total,
        installment_amount_minor=installment_amount_minor,
        first_installment_on=first_installment_on,
    )
    session.add(purchase)
    await session.flush()
    return purchase


async def _billed_cutoff(session: AsyncSession, card_id: UUID) -> date | None:
    last = await latest_statement(session, card_id)
    return last.cycle_ends_on if last else None


async def delete_purchase(
    session: AsyncSession, member: HouseholdMember, card_id: UUID, purchase_id: UUID
) -> None:
    card = await _get_owned_card(session, member, card_id)
    purchase = await session.scalar(
        select(CreditCardPurchase).where(
            CreditCardPurchase.id == purchase_id, CreditCardPurchase.card_id == card.id
        )
    )
    if purchase is None:
        raise NotFoundError
    cutoff = await _billed_cutoff(session, card.id)
    if cutoff is not None and purchase.purchased_on <= cutoff:
        raise PurchaseAlreadyBilledError
    await session.delete(purchase)
    await session.flush()


async def add_payment(
    session: AsyncSession,
    member: HouseholdMember,
    card_id: UUID,
    amount_minor: int,
    paid_on: date,
    note: str | None,
) -> CreditCardPayment:
    card = await _get_owned_card(session, member, card_id)
    payment = CreditCardPayment(
        id=new_id(), household_id=card.household_id, card_id=card.id,
        amount_minor=amount_minor, paid_on=paid_on, note=note,
    )
    session.add(payment)
    await session.flush()
    return payment


async def delete_payment(
    session: AsyncSession, member: HouseholdMember, card_id: UUID, payment_id: UUID
) -> None:
    card = await _get_owned_card(session, member, card_id)
    payment = await session.scalar(
        select(CreditCardPayment).where(
            CreditCardPayment.id == payment_id, CreditCardPayment.card_id == card.id
        )
    )
    if payment is None:
        raise NotFoundError
    cutoff = await _billed_cutoff(session, card.id)
    if cutoff is not None and payment.paid_on <= cutoff:
        raise PaymentAlreadyBilledError
    await session.delete(payment)
    await session.flush()


async def delete_card(session: AsyncSession, member: HouseholdMember, card_id: UUID) -> None:
    card = await _get_owned_card(session, member, card_id)
    has_purchases = await session.scalar(
        select(func.count()).select_from(CreditCardPurchase).where(
            CreditCardPurchase.card_id == card.id
        )
    )
    has_payments = await session.scalar(
        select(func.count()).select_from(CreditCardPayment).where(
            CreditCardPayment.card_id == card.id
        )
    )
    if has_purchases or has_payments:
        raise CreditCardHasActivityError
    await session.delete(card)
    await session.flush()


CardDetail = tuple[
    CreditCard, list[CreditCardPurchase], list[CreditCardPayment], list[CreditCardStatement]
]


async def get_card_detail(
    session: AsyncSession, member: HouseholdMember, card_id: UUID
) -> CardDetail:
    card = await _get_owned_card(session, member, card_id)
    await ensure_statements_current(session, card, date.today())
    purchases = list(
        await session.scalars(
            select(CreditCardPurchase)
            .where(CreditCardPurchase.card_id == card.id)
            .order_by(CreditCardPurchase.purchased_on.desc())
        )
    )
    payments = list(
        await session.scalars(
            select(CreditCardPayment)
            .where(CreditCardPayment.card_id == card.id)
            .order_by(CreditCardPayment.paid_on.desc())
        )
    )
    statements = list(
        await session.scalars(
            select(CreditCardStatement)
            .where(CreditCardStatement.card_id == card.id)
            .order_by(CreditCardStatement.cycle_starts_on.desc())
        )
    )
    return card, purchases, payments, statements
